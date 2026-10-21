using System.Net;
using System.Net.Sockets;

namespace PulseDeck.Core;

public sealed class MonitorEngine(IProbeProvider probes, INetworkProvider networks, TimeProvider? clock = null, TimeSpan? interval = null, ITrafficProvider? traffic = null) : IAsyncDisposable
{
    public const int Capacity = 600;
    private readonly TimeProvider _clock = clock ?? TimeProvider.System;
    private readonly TimeSpan _interval = interval ?? TimeSpan.FromSeconds(1);
    public TrafficMonitor? Traffic { get; } = traffic is null ? null : new(traffic, clock ?? TimeProvider.System);
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _sync = new();
    private readonly Queue<Sample> _gateway = new();
    private readonly Queue<Sample> _internet = new();
    private readonly CancellationTokenSource _shutdown = new();
    private CancellationTokenSource? _run;
    private Task[] _workers = [];
    private Task? _networkWatch;
    private NetworkState _network = new(false, null, "Detecting adapter", null, []);
    private MonitorSettings _settings = new();
    private bool _paused = true;
    private bool _disposed;
    private DateTimeOffset _started;
    private long _runStarted;
    private double _elapsed;
    private DateTimeOffset _pausedAt;
    private string? _lastRoute;

    public async Task InitializeAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_networkWatch is not null) return;
            lock (_sync) { _network = ReadNetwork(); _lastRoute = _network.Connected ? Route(_network) : null; _started = _clock.GetUtcNow(); _runStarted = _clock.GetTimestamp(); _paused = false; }
            StartWorkers();
            _networkWatch = Task.Run(WatchNetworkAsync);
        }
        finally { _gate.Release(); }
    }

    private NetworkState ReadNetwork()
    {
        try { return networks.Read() with { ObservedAt = _clock.GetUtcNow() }; }
        catch (Exception ex) { return new(false, null, "Detection unavailable", null, [], ex.Message, ObservedAt: _clock.GetUtcNow()); }
    }

    private static string Route(NetworkState network) => $"{network.AdapterId}/{network.Gateway}";

    // Called under _sync after any old workers have been joined.
    private void ApplyNetwork(NetworkState next)
    {
        if (next.Connected && _lastRoute is not null && Route(next) != _lastRoute) { _gateway.Clear(); _internet.Clear(); Traffic?.Clear(); }
        if (_settings.GatewayOverride is null && next.Gateway is not null && _gateway.TryPeek(out var previous) && previous.Destination != next.Gateway) _gateway.Clear();
        if (next.Connected) _lastRoute = Route(next);
        _network = next;
    }

    private async Task WatchNetworkAsync()
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1), _clock);
        try { while (await timer.WaitForNextTickAsync(_shutdown.Token).ConfigureAwait(false)) await RefreshNetworkAsync().ConfigureAwait(false); }
        catch (OperationCanceledException) when (_shutdown.IsCancellationRequested) { }
    }

    public async Task RefreshNetworkAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed || _paused) return;
            var next = ReadNetwork();
            bool restart;
            lock (_sync) restart = next.Connected != _network.Connected || next.AdapterId != _network.AdapterId || next.Gateway != _network.Gateway;
            if (restart) await StopWorkersAsync().ConfigureAwait(false);
            lock (_sync)
            {
                // Keep gaps on reconnect to the same route; never mix samples from different routes.
                ApplyNetwork(next);
            }
            if (restart) StartWorkers();
        }
        finally { _gate.Release(); }
    }

    public async Task SetPausedAsync(bool paused)
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed || paused == _paused) return;
            await StopWorkersAsync().ConfigureAwait(false);
            // Polling is suspended while paused. Revalidate the route before restarting probes.
            if (!paused) { var next = ReadNetwork(); lock (_sync) ApplyNetwork(next); }
            lock (_sync)
            {
                if (paused) { _elapsed += _clock.GetElapsedTime(_runStarted).TotalSeconds; _pausedAt = _clock.GetUtcNow(); }
                else _runStarted = _clock.GetTimestamp();
                _paused = paused;
            }
            StartWorkers();
        }
        finally { _gate.Release(); }
    }

    public async Task ResetAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed) return;
            await StopWorkersAsync().ConfigureAwait(false);
            lock (_sync) { _gateway.Clear(); _internet.Clear(); Traffic?.Clear(); _elapsed = 0; _started = _clock.GetUtcNow(); _pausedAt = _started; _runStarted = _clock.GetTimestamp(); }
            StartWorkers();
        }
        finally { _gate.Release(); }
    }

    public static bool IsTarget(string? value) => value is not null && IPAddress.TryParse(value, out var ip) && ip.AddressFamily == AddressFamily.InterNetwork
        && ip.ToString() == value && ip.GetAddressBytes()[0] is > 0 and < 224 && !value.EndsWith(".255", StringComparison.Ordinal);

    public async Task ConfigureAsync(MonitorSettings settings)
    {
        if ((settings.GatewayOverride is not null && !IsTarget(settings.GatewayOverride)) || !IsTarget(settings.InternetTarget) || settings.TimeoutMs is < 250 or > 10000)
            throw new ArgumentException("Use IPv4 unicast targets and a timeout between 250 and 10000 ms.");
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed) return;
            if ((settings.GatewayOverride ?? _network.Gateway) == settings.InternetTarget)
                throw new ArgumentException("Gateway and internet targets must be different.");
            await StopWorkersAsync().ConfigureAwait(false);
            lock (_sync)
            {
                if (settings != _settings) { _gateway.Clear(); _internet.Clear(); Traffic?.Clear(); _elapsed = 0; _started = _clock.GetUtcNow(); _pausedAt = _started; _runStarted = _clock.GetTimestamp(); }
                _settings = settings;
            }
            StartWorkers();
        }
        finally { _gate.Release(); }
    }

    private void StartWorkers()
    {
        if (_paused || _disposed || (!_network.Connected && _network.Error is null)) return;
        _run = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
        var token = _run.Token;
        var gateway = _settings.GatewayOverride ?? _network.Gateway;
        _workers = gateway is null || gateway == _settings.InternetTarget ? [Task.Run(() => ProbeLoopAsync(_settings.InternetTarget, _internet, token))]
            : [Task.Run(() => ProbeLoopAsync(gateway, _gateway, token)), Task.Run(() => ProbeLoopAsync(_settings.InternetTarget, _internet, token))];
        if (Traffic is not null && _network.AdapterId is { } adapterId)
            _workers = [.. _workers, Task.Run(() => Traffic.RunAsync(adapterId, token))];
    }

    private async Task StopWorkersAsync()
    {
        if (_run is null) return;
        await _run.CancelAsync().ConfigureAwait(false);
        try { await Task.WhenAll(_workers).ConfigureAwait(false); }
        catch (OperationCanceledException) { }
        _run.Dispose(); _run = null; _workers = [];
    }

    private async Task ProbeLoopAsync(string target, Queue<Sample> buffer, CancellationToken token)
    {
        try
        {
            while (!token.IsCancellationRequested)
            {
                var start = _clock.GetTimestamp();
                ProbeResult result;
                // The native timeout is primary; this deadline also bounds a provider that stalls.
                // Let the runtime own timer cancellation/disposal synchronization. A custom timer
                // calling Cancel can race Dispose even after ITimer.Dispose has returned.
                using var deadlineTimeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(_settings.TimeoutMs), _clock);
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token, deadlineTimeout.Token);
                try { result = await probes.ProbeAsync(target, TimeSpan.FromMilliseconds(_settings.TimeoutMs), deadline.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) when (!token.IsCancellationRequested) { result = new(ProbeStatus.Timeout, null, "Probe deadline exceeded"); }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex) { result = new(ProbeStatus.Error, null, ex.Message); }
                token.ThrowIfCancellationRequested();
                if (result.Status == ProbeStatus.Success && (result.RttMs is null || !double.IsFinite(result.RttMs.Value) || result.RttMs < 0)) result = new(ProbeStatus.Error, null, "Invalid RTT returned by probe provider");
                lock (_sync)
                {
                    buffer.Enqueue(new(_clock.GetUtcNow(), target, result.Status == ProbeStatus.Success ? result.RttMs : null, result.Status, result.Error));
                    while (buffer.Count > Capacity) buffer.Dequeue();
                }
                var remaining = _interval - _clock.GetElapsedTime(start);
                // No catch-up queue; after a slow probe, give other work a small scheduling opportunity.
                await Task.Delay(remaining > TimeSpan.Zero ? remaining : TimeSpan.FromMilliseconds(10), _clock, token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
    }

    public MonitorSnapshot Snapshot()
    {
        lock (_sync)
        {
            var now = _paused ? _pausedAt : _clock.GetUtcNow();
            EndpointSnapshot Endpoint(string id, string? target, Queue<Sample> buffer)
            {
                var samples = buffer.ToArray();
                return new(id, target, samples, Statistics.Calculate(samples, now, TimeSpan.FromSeconds(60)), Statistics.Calculate(samples, now, TimeSpan.FromMinutes(5)));
            }
            return new(now, _started, _elapsed + (_paused ? 0 : _clock.GetElapsedTime(_runStarted).TotalSeconds), _paused, _network, _settings,
                Endpoint("gateway", _settings.GatewayOverride ?? _network.Gateway, _gateway), Endpoint("internet", _settings.InternetTarget, _internet));
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _shutdown.CancelAsync().ConfigureAwait(false);
        if (_networkWatch is not null) await _networkWatch.ConfigureAwait(false);
        await _gate.WaitAsync().ConfigureAwait(false);
        try { _disposed = true; await StopWorkersAsync().ConfigureAwait(false); }
        finally { _gate.Release(); }
        _shutdown.Dispose();
    }
}
