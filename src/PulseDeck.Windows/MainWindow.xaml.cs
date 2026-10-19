using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using PulseDeck.Core;

namespace PulseDeck.Windows;

public partial class MainWindow : Window
{
    private const string Origin = "https://wiffer.local";
    private readonly MonitorEngine _engine = new(new NativeProbe(), new WindowsNetworkProvider(), traffic: new WindowsNetworkProvider());
    private readonly SemaphoreSlim _commands = new(1, 1);
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(250) };
    private int _ticks;
    private long _trafficGeneration = -1;
    private long _trafficSequence;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) } };
    private Task? _initialization;
    private bool _ready;
    private bool _closing;
    private bool _closed;

    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    public MainWindow()
    {
        InitializeComponent();
        Width = Math.Min(1366, SystemParameters.WorkArea.Width - 32);
        Height = Math.Min(880, SystemParameters.WorkArea.Height - 32);
        SourceInitialized += (_, _) =>
        {
            var dark = 1; DwmSetWindowAttribute(new WindowInteropHelper(this).Handle, 20, ref dark, sizeof(int));
            // Reproducible physical-pixel window sizes for local visual verification.
            var size = Environment.GetCommandLineArgs().FirstOrDefault(a => a.StartsWith("--window-size=", StringComparison.Ordinal))?.Split('=')[1].Split('x');
            if (size is { Length: 2 } && int.TryParse(size[0], out var width) && int.TryParse(size[1], out var height) && width is >= 860 and <= 3840 && height is >= 540 and <= 2160)
            {
                var dpi = System.Windows.Media.VisualTreeHelper.GetDpi(this);
                Width = width / dpi.DpiScaleX; Height = height / dpi.DpiScaleY;
            }
        };
        Loaded += async (_, _) => { _initialization = InitializeAsync(); await _initialization; };
        Closing += OnClosing;
        _timer.Tick += (_, _) => { if (++_ticks % 4 == 0) SendSnapshot(); SendTraffic(); };
    }

    private static bool Trusted(string uri) => Uri.TryCreate(uri, UriKind.Absolute, out var parsed) && parsed.Scheme == "https" && parsed.Host == "wiffer.local" && parsed.IsDefaultPort && parsed.UserInfo.Length == 0;

    private async Task InitializeAsync()
    {
        try
        {
            var assets = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            if (!File.Exists(Path.Combine(assets, "index.html"))) throw new FileNotFoundException("Local UI assets are missing. Run npm --prefix ui ci, npm --prefix ui run build, then rebuild the desktop project.");
            var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Wiffer", "WebView2");
            var env = await CoreWebView2Environment.CreateAsync(null, profile);
            if (_closing) return;
            await Browser.EnsureCoreWebView2Async(env);
            var web = Browser.CoreWebView2;
            web.SetVirtualHostNameToFolderMapping("wiffer.local", assets, CoreWebView2HostResourceAccessKind.Deny);
            web.Settings.AreDevToolsEnabled = false;
            web.Settings.AreDefaultContextMenusEnabled = false;
            web.Settings.AreBrowserAcceleratorKeysEnabled = false;
            web.Settings.IsStatusBarEnabled = false;
            web.Settings.IsBuiltInErrorPageEnabled = false;
            web.Settings.AreHostObjectsAllowed = false;
            web.Settings.IsGeneralAutofillEnabled = false;
            web.Settings.IsPasswordAutosaveEnabled = false;
            web.NavigationStarting += (_, e) => { e.Cancel = !Trusted(e.Uri); if (!e.Cancel) _ready = false; };
            web.FrameNavigationStarting += (_, e) => e.Cancel = true;
            web.NewWindowRequested += (_, e) => e.Handled = true;
            web.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            web.DownloadStarting += (_, e) => e.Cancel = true;
            web.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            web.WebResourceRequested += (_, e) => { if (!Trusted(e.Request.Uri)) e.Response = env.CreateWebResourceResponse(null, 403, "External requests disabled", "Content-Type: text/plain"); };
            web.WebMessageReceived += OnMessage;
            web.ProcessFailed += (_, e) => { _ready = false; _timer.Stop(); _ = PauseAfterFailureAsync($"The embedded interface stopped ({e.ProcessFailedKind}). Close and reopen Wiffer."); };
            web.NavigationCompleted += (_, e) => { if (!e.IsSuccess) _ = PauseAfterFailureAsync($"The local interface could not load ({e.WebErrorStatus}). Rebuild the frontend and restart Wiffer."); };
            await Task.Run(() => _engine.InitializeAsync());
            if (_closing) return;
            web.Navigate(Origin + "/index.html");
            _timer.Start();
        }
        catch (WebView2RuntimeNotFoundException) { ShowFailure("Microsoft Edge WebView2 Runtime is required. Install the Evergreen Runtime from https://developer.microsoft.com/microsoft-edge/webview2/ and reopen Wiffer. No administrator privileges are required for normal use."); }
        catch (Exception ex) { await _engine.SetPausedAsync(true); ShowFailure("Wiffer could not start. " + ex.Message); }
    }

    private void ShowFailure(string message) { Browser.Visibility = Visibility.Hidden; StartupMessage.Text = message; StartupMessage.Visibility = Visibility.Visible; }
    private async Task PauseAfterFailureAsync(string message) { await _engine.SetPausedAsync(true); ShowFailure(message); }
    private void Send(object message)
    {
        if (_closing || Browser.CoreWebView2 is null) return;
        try { Browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(message, Json)); }
        catch (Exception ex) when (ex is InvalidOperationException or COMException) { _ready = false; _timer.Stop(); _ = PauseAfterFailureAsync("The interface connection was lost. Restart Wiffer."); }
    }
    private void SendSnapshot() { if (_ready) Send(new { version = 2, type = "snapshot", snapshot = _engine.Snapshot() }); }
    private void SendTraffic()
    {
        if (!_ready || _engine.Traffic is null) return;
        var batch = _engine.Traffic.Since(_trafficGeneration, _trafficSequence);
        if (batch.Generation == _trafficGeneration && batch.Samples.Length == 0) return;
        Send(new { version = 2, type = "traffic", batch });
        _trafficGeneration = batch.Generation;
        if (batch.Samples.Length > 0) _trafficSequence = batch.Samples[^1].Sequence;
    }

    private async void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (_closing || !Trusted(e.Source)) return;
        BridgeCommand command;
        try { command = BridgeCommand.Parse(e.WebMessageAsJson); }
        catch (Exception ex) when (ex is JsonException or ArgumentException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException)
        { Send(new { version = 2, type = "error", id = (string?)null, message = "Invalid command: " + ex.Message }); return; }
        if (!await _commands.WaitAsync(0)) { Send(new { version = 2, type = "error", id = command.Id, message = "Another command is still completing." }); return; }
        try
        {
            switch (command.Type)
            {
                case "ready": _trafficGeneration = -1; _trafficSequence = 0; _ready = true; Browser.Visibility = Visibility.Visible; StartupMessage.Visibility = Visibility.Collapsed; break;
                case "pause": await _engine.SetPausedAsync(true); break;
                case "resume": await _engine.SetPausedAsync(false); break;
                case "reset": await _engine.ResetAsync(); break;
                case "configure": await _engine.ConfigureAsync(command.Settings!); break;
            }
            SendSnapshot();
            SendTraffic();
            Send(new { version = 2, type = "ack", id = command.Id });
        }
        catch (Exception ex) { Send(new { version = 2, type = "error", id = command.Id, message = ex.Message }); }
        finally { _commands.Release(); }
    }

    private async void OnClosing(object? sender, CancelEventArgs e)
    {
        if (_closed) return;
        e.Cancel = true;
        if (_closing) return;
        _closing = true; _timer.Stop();
        if (_initialization is not null) await _initialization;
        await _commands.WaitAsync();
        try { await _engine.DisposeAsync(); Browser.Dispose(); }
        finally { _commands.Release(); _closed = true; Close(); }
    }
}
