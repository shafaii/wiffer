using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;

namespace PulseDeck.Core;

public sealed record SpeedTestState(string Status, string Phase, double ElapsedSeconds, double Progress,
    double? LiveDownloadMbps, double? LiveUploadMbps, double? DownloadMbps, double? UploadMbps,
    double? IdleLatencyMs, double? DownloadLatencyMs, double? UploadLatencyMs,
    long DownloadBytes, long UploadBytes, double? DownloadSeconds, double? UploadSeconds, string Endpoint, string? Server, string? Error)
{
    public static SpeedTestState Idle => new("idle", "Ready", 0, 0, null, null, null, null, null, null, null, 0, 0, null, null, "speed.cloudflare.com", null, null);
}

/// <summary>Explicit native HTTPS test. No NIC counters, logging API, redirects, cookies or automatic starts.</summary>
public sealed class QuickSpeedTest : IAsyncDisposable
{
    private readonly HttpClient _http;
    private readonly object _sync = new();
    private readonly TimeSpan _phaseDuration;
    private readonly TimeSpan _totalDuration;
    private bool _userCanceled;
    private CancellationTokenSource? _cancel;
    private Task? _task;
    private SpeedTestState _state = SpeedTestState.Idle;
    private string? _cancelReason;
    private bool _disposed;
    private long _started;
    public QuickSpeedTest(HttpMessageHandler? handler = null, TimeSpan? phaseDuration = null, TimeSpan? totalDuration = null)
    {
        _http = new(handler ?? new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false,
            AutomaticDecompression = DecompressionMethods.None, MaxConnectionsPerServer = 4, ConnectTimeout = TimeSpan.FromSeconds(5) });
        _http.Timeout = Timeout.InfiniteTimeSpan;
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("Wiffer/0.7");
        _http.DefaultRequestHeaders.CacheControl = new CacheControlHeaderValue { NoCache = true, NoStore = true };
        _phaseDuration = phaseDuration ?? TimeSpan.FromSeconds(10);
        _totalDuration = totalDuration ?? TimeSpan.FromSeconds(35);
    }
    public SpeedTestState Snapshot() { lock (_sync) return _state.Status == "running" ? _state with { ElapsedSeconds = Stopwatch.GetElapsedTime(_started).TotalSeconds } : _state; }
    private void Update(Func<SpeedTestState, SpeedTestState> update) { lock (_sync) _state = update(_state); }
    public void Start()
    {
        lock (_sync)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_task is { IsCompleted: false }) throw new InvalidOperationException("A speed test is already running.");
            _cancel?.Dispose();
            _cancel = new CancellationTokenSource(_totalDuration);
            _cancelReason = null; _userCanceled = false;
            _started = Stopwatch.GetTimestamp();
            _state = SpeedTestState.Idle with { Status = "running", Phase = "Idle latency" };
            _task = Task.Run(() => RunAsync(_cancel.Token));
        }
    }
    public async Task CancelAsync(string? reason = null)
    {
        Task? task;
        lock (_sync)
        {
            task = _task;
            if (task is { IsCompleted: false }) { _cancelReason = reason; _userCanceled = true; _cancel!.Cancel(); }
        }
        if (task is not null) await task.ConfigureAwait(false);
    }
    public static double Mbps(long bytes, double seconds)
    {
        if (bytes < 0 || !double.IsFinite(seconds) || seconds <= 0) throw new ArgumentOutOfRangeException(nameof(seconds));
        return bytes * 8d / seconds / 1_000_000;
    }
    private async Task RunAsync(CancellationToken token)
    {
        var total = Stopwatch.StartNew();
        try
        {
            // First request warms TLS/DNS; subsequent samples include HTTP/server latency.
            await LatencyAsync(token).ConfigureAwait(false);
            var idle = new List<double>();
            for (var i = 0; i < 3; i++) { var ms = await LatencyAsync(token).ConfigureAwait(false); if (ms is { } value) idle.Add(value); }
            Update(s => s with { IdleLatencyMs = Median(idle) });
            await TransferAsync(false, total, token).ConfigureAwait(false);
            await TransferAsync(true, total, token).ConfigureAwait(false);
            token.ThrowIfCancellationRequested();
            Update(s => s with { Status = "complete", Phase = "Complete", Progress = 1, ElapsedSeconds = total.Elapsed.TotalSeconds, LiveDownloadMbps = null, LiveUploadMbps = null });
        }
        catch (OperationCanceledException)
        {
            string? reason; bool canceled; lock (_sync) { reason = _cancelReason; canceled = _userCanceled; }
            if (!canceled) reason = "The 35-second test deadline was exceeded. Check the connection and try again.";
            Update(s => s with { Status = reason is null ? "canceled" : "error", Phase = reason is null ? "Canceled" : "Test stopped",
                ElapsedSeconds = total.Elapsed.TotalSeconds, LiveDownloadMbps = null, LiveUploadMbps = null, DownloadMbps = null, UploadMbps = null, Error = reason });
        }
        catch (Exception ex)
        {
            Update(s => s with { Status = "error", Phase = "Test failed", ElapsedSeconds = total.Elapsed.TotalSeconds,
                LiveDownloadMbps = null, LiveUploadMbps = null, DownloadMbps = null, UploadMbps = null, Error = ex is HttpRequestException ? "Test endpoint unavailable: " + ex.Message : ex.Message });
        }
    }
    private static double? Median(List<double> data) { if (data.Count == 0) return null; var a = data.Order().ToArray(); return a.Length % 2 == 0 ? (a[a.Length / 2 - 1] + a[a.Length / 2]) / 2 : a[a.Length / 2]; }
    private async Task<double?> LatencyAsync(CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token); deadline.CancelAfter(TimeSpan.FromSeconds(2));
        var watch = Stopwatch.StartNew();
        try
        {
            using var response = await _http.GetAsync("https://speed.cloudflare.com/__down?bytes=0", HttpCompletionOption.ResponseHeadersRead, deadline.Token).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            var elapsed = watch.Elapsed.TotalMilliseconds;
            if (response.Headers.TryGetValues("cf-ray", out var values))
            {
                var suffix = values.FirstOrDefault()?.Split('-').LastOrDefault();
                if (suffix is { Length: 3 } && suffix.All(char.IsAsciiLetter)) Update(s => s with { Server = "Cloudflare edge / " + suffix.ToUpperInvariant() });
            }
            return elapsed;
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested) { return null; }
        catch (HttpRequestException) { return null; }
    }
    private async Task TransferAsync(bool upload, Stopwatch total, CancellationToken token)
    {
        Update(s => s with { Phase = upload ? "Upload" : "Download", LiveDownloadMbps = null, LiveUploadMbps = null });
        using var phase = CancellationTokenSource.CreateLinkedTokenSource(token);
        phase.CancelAfter(_phaseDuration);
        var watch = Stopwatch.StartNew();
        long bytes = 0, reserved = 0;
        var completed = 0;
        var limit = upload ? 128_000_000L : 256_000_000L;
        var chunkSize = upload ? 1_000_000 : 4_000_000;
        // Random bounded payload avoids compression artifacts. Only HTTP-confirmed upload bodies count.
        var payload = upload ? System.Security.Cryptography.RandomNumberGenerator.GetBytes(chunkSize) : [];
        async Task Worker()
        {
            while (!phase.IsCancellationRequested)
            {
                var allocation = Interlocked.Add(ref reserved, chunkSize);
                if (allocation > limit) return;
                using var request = new HttpRequestMessage(upload ? HttpMethod.Post : HttpMethod.Get,
                    upload ? "https://speed.cloudflare.com/__up" : $"https://speed.cloudflare.com/__down?bytes={chunkSize}");
                if (upload) { request.Content = new ByteArrayContent(payload); request.Content.Headers.ContentType = new("application/octet-stream"); }
                using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, phase.Token).ConfigureAwait(false);
                response.EnsureSuccessStatusCode();
                if (upload) Interlocked.Add(ref bytes, chunkSize);
                else
                {
                    if (response.Content.Headers.ContentEncoding.Count != 0) throw new HttpRequestException("Compressed test responses cannot be measured.");
                    using var body = await response.Content.ReadAsStreamAsync(phase.Token).ConfigureAwait(false);
                    var buffer = new byte[65536];
                    long received = 0;
                    int read;
                    while ((read = await body.ReadAsync(buffer, phase.Token).ConfigureAwait(false)) != 0)
                    {
                        received += read;
                        if (received > chunkSize) throw new HttpRequestException("Unexpected test response size.");
                        Interlocked.Add(ref bytes, read);
                    }
                    if (received != chunkSize) throw new HttpRequestException("Incomplete test response.");
                }
                Interlocked.Increment(ref completed);
            }
        }
        var latencies = new List<double>();
        async Task LoadedLatency()
        {
            try
            {
                while (!phase.IsCancellationRequested)
                {
                    var value = await LatencyAsync(phase.Token).ConfigureAwait(false);
                    if (value is { } ms && !phase.IsCancellationRequested && latencies.Count < 32) latencies.Add(ms);
                    await Task.Delay(1000, phase.Token).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) when (phase.IsCancellationRequested) { }
        }
        var latencyTask = LoadedLatency();
        // A failed stream immediately cancels its sibling; all tasks are joined before returning.
        async Task GuardedWorker()
        {
            try { await Worker().ConfigureAwait(false); }
            catch (OperationCanceledException) when (phase.IsCancellationRequested) { }
            catch { await phase.CancelAsync().ConfigureAwait(false); throw; }
        }
        var transfers = Task.WhenAll(GuardedWorker(), GuardedWorker());
        long lastBytes = 0; var lastSeconds = 0d;
        try
        {
            while (!transfers.IsCompleted)
            {
                await Task.WhenAny(transfers, Task.Delay(250, token)).ConfigureAwait(false);
                token.ThrowIfCancellationRequested();
                var seconds = watch.Elapsed.TotalSeconds; var current = Interlocked.Read(ref bytes);
                var rate = Mbps(current - lastBytes, Math.Max(.000001, seconds - lastSeconds));
                lastBytes = current; lastSeconds = seconds;
                Update(s => s with { ElapsedSeconds = total.Elapsed.TotalSeconds,
                    Progress = (upload ? .5 : .05) + Math.Min(1, seconds / _phaseDuration.TotalSeconds) * .45,
                    LiveDownloadMbps = upload ? null : rate, LiveUploadMbps = upload ? rate : null,
                    DownloadBytes = upload ? s.DownloadBytes : current, UploadBytes = upload ? current : s.UploadBytes });
            }
            await transfers.ConfigureAwait(false);
        }
        finally { await phase.CancelAsync().ConfigureAwait(false); try { await transfers.ConfigureAwait(false); } finally { await latencyTask.ConfigureAwait(false); } }
        token.ThrowIfCancellationRequested();
        var duration = watch.Elapsed.TotalSeconds;
        if (completed == 0 || bytes == 0) throw new HttpRequestException("Server too slow: no complete transfer within the test window.");
        var result = Mbps(bytes, duration);
        Update(s => upload ? s with { UploadMbps = result, UploadSeconds = duration, UploadLatencyMs = Median(latencies), UploadBytes = bytes, LiveUploadMbps = null }
            : s with { DownloadMbps = result, DownloadSeconds = duration, DownloadLatencyMs = Median(latencies), DownloadBytes = bytes, LiveDownloadMbps = null });
    }
    public async ValueTask DisposeAsync()
    {
        lock (_sync) _disposed = true;
        await CancelAsync().ConfigureAwait(false);
        _cancel?.Dispose(); _http.Dispose();
    }
}
