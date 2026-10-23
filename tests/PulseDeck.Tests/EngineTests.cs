using System.Collections.Concurrent;
using PulseDeck.Core;
using Xunit;

namespace PulseDeck.Tests;

public class EngineTests
{
    private sealed class SerializedNetwork : INetworkProvider
    {
        public int Reads, Active, Overlaps;
        public NetworkState Read()
        {
            Interlocked.Increment(ref Reads);
            if (Interlocked.Increment(ref Active) != 1) Interlocked.Increment(ref Overlaps);
            try { Thread.Sleep(10); return new(true, "wifi", "Wi-Fi", "192.168.1.1", []); }
            finally { Interlocked.Decrement(ref Active); }
        }
    }
    [Fact] public async Task RadioRefreshIsSerializedTimestampedAndStopsWhilePaused()
    {
        var provider = new SerializedNetwork(); var clock = new Clock();
        await using var engine = new MonitorEngine(new Probe(), provider, clock);
        await engine.InitializeAsync(); Assert.Equal(clock.Now, engine.Snapshot().Network.ObservedAt);
        clock.Now = clock.Now.AddSeconds(1);
        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Task.Run(engine.RefreshNetworkAsync)));
        Assert.Equal(0, provider.Overlaps); Assert.Equal(clock.Now, engine.Snapshot().Network.ObservedAt);
        await engine.SetPausedAsync(true); var count = provider.Reads;
        clock.Now = clock.Now.AddSeconds(3); await engine.RefreshNetworkAsync();
        Assert.Equal(count, provider.Reads); Assert.NotEqual(clock.Now, engine.Snapshot().Network.ObservedAt);
        await engine.SetPausedAsync(false); await engine.RefreshNetworkAsync(); Assert.Equal(clock.Now, engine.Snapshot().Network.ObservedAt);
    }
    [Fact] public async Task CompletedNetworkObservationNotifiesAfterCommitAndNeverWhilePaused()
    {
        var network = new Network(); var clock = new Clock();
        await using var engine = new MonitorEngine(new Probe(), network, clock);
        await engine.InitializeAsync();
        var notifications = new List<NetworkState>();
        engine.NetworkObserved += () => notifications.Add(engine.Snapshot().Network);
        clock.Now = clock.Now.AddSeconds(1);
        await engine.RefreshNetworkAsync();
        Assert.Single(notifications); Assert.Equal(clock.Now, notifications[0].ObservedAt);
        network.Value = new(false, null, "Disconnected", null, []);
        await engine.RefreshNetworkAsync();
        Assert.Equal(2, notifications.Count); Assert.False(notifications[1].Connected);
        await engine.SetPausedAsync(true); await engine.RefreshNetworkAsync();
        Assert.Equal(2, notifications.Count);
    }
    private sealed class Network : INetworkProvider
    {
        public NetworkState Value = new(true, "nic1", "Ethernet", "192.168.1.1", []);
        public NetworkState Read() => Value;
    }
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = DateTimeOffset.Parse("2026-10-18T10:00:00Z");
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class QueuedTimerClock : TimeProvider
    {
        private readonly ConcurrentBag<QueuedTimer> _timers = [];
        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            var timer = new QueuedTimer(callback, state); _timers.Add(timer); return timer;
        }
        public void FireDisposedCallbacks() { foreach (var timer in _timers.ToArray()) if (timer.Disposed) timer.Fire(); }
        private sealed class QueuedTimer(TimerCallback callback, object? state) : ITimer
        {
            public bool Disposed;
            public bool Change(TimeSpan dueTime, TimeSpan period) => !Disposed;
            public void Dispose() => Disposed = true;
            public ValueTask DisposeAsync() { Dispose(); return ValueTask.CompletedTask; }
            public void Fire() => callback(state);
        }
    }
    private sealed class Probe : IProbeProvider
    {
        public Func<string, CancellationToken, Task<ProbeResult>> Handler = (_, _) => Task.FromResult(new ProbeResult(ProbeStatus.Success, 12));
        public readonly ConcurrentDictionary<string, int> Calls = new();
        public readonly ConcurrentDictionary<string, int> Active = new();
        public int Overlaps;
        public async Task<ProbeResult> ProbeAsync(string destination, TimeSpan timeout, CancellationToken token)
        {
            Calls.AddOrUpdate(destination, 1, (_, n) => n + 1);
            if (Active.AddOrUpdate(destination, 1, (_, n) => n + 1) > 1) Interlocked.Increment(ref Overlaps);
            try { return await Handler(destination, token); }
            finally { Active.AddOrUpdate(destination, 0, (_, n) => n - 1); }
        }
    }
    private static MonitorEngine Engine(Probe probe, Network? network = null, TimeProvider? clock = null) => new(probe, network ?? new Network(), clock, TimeSpan.FromMilliseconds(5));
    private static async Task Until(Func<bool> condition)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        while (!condition()) await Task.Delay(5, timeout.Token);
    }
    [Fact] public async Task TargetsAreIndependentAndNeverOverlap()
    {
        var probe = new Probe { Handler = async (target, token) => { await Task.Delay(target == "1.1.1.1" ? 150 : 5, token); return new(ProbeStatus.Success, 7); } };
        await using var engine = Engine(probe); await engine.InitializeAsync();
        await Until(() => engine.Snapshot().Internet.Samples.Length >= 2);
        await engine.SetPausedAsync(true);
        Assert.True(engine.Snapshot().Gateway.Samples.Length > engine.Snapshot().Internet.Samples.Length); Assert.Equal(0, probe.Overlaps);
        Assert.All(probe.Active.Values, n => Assert.Equal(0, n));
    }
    [Fact] public async Task PauseCancelsInflightWithoutCountingLossAndResumeRestarts()
    {
        var probe = new Probe { Handler = async (_, token) => { await Task.Delay(Timeout.Infinite, token); return new(ProbeStatus.Success, 1); } };
        await using var engine = Engine(probe); await engine.InitializeAsync(); await Until(() => probe.Calls.Count == 2);
        await engine.SetPausedAsync(true); var calls = probe.Calls.Values.Sum(); await Task.Delay(40);
        Assert.Equal(calls, probe.Calls.Values.Sum()); Assert.Empty(engine.Snapshot().Internet.Samples); Assert.Empty(engine.Snapshot().Gateway.Samples);
        probe.Handler = (_, _) => Task.FromResult(new ProbeResult(ProbeStatus.Success, 8));
        await engine.SetPausedAsync(false); await Until(() => engine.Snapshot().Internet.Samples.Length > 0);
    }
    [Fact] public async Task DeadlineBecomesTimeoutButProviderErrorRemainsError()
    {
        var probe = new Probe { Handler = async (target, token) => { if (target == "192.168.1.1") throw new InvalidOperationException("synthetic transport error"); await Task.Delay(Timeout.Infinite, token); return new(ProbeStatus.Success, 1); } };
        await using var engine = Engine(probe); await engine.ConfigureAsync(new(TimeoutMs: 250)); await engine.InitializeAsync();
        await Until(() => engine.Snapshot().Internet.Samples.Length > 0); await engine.SetPausedAsync(true);
        Assert.All(engine.Snapshot().Internet.Samples, s => { Assert.Equal(ProbeStatus.Timeout, s.Status); Assert.Null(s.RttMs); });
        Assert.All(engine.Snapshot().Gateway.Samples, s => { Assert.Equal(ProbeStatus.Error, s.Status); Assert.Null(s.RttMs); });
    }
    [Fact] public async Task ResetClearsBothBuffersAndRetainsPauseState()
    {
        var probe = new Probe(); await using var engine = Engine(probe); await engine.InitializeAsync(); await Until(() => engine.Snapshot().Internet.Samples.Length >= 3);
        await engine.SetPausedAsync(true); await engine.ResetAsync();
        var state = engine.Snapshot(); Assert.Empty(state.Gateway.Samples); Assert.Empty(state.Internet.Samples); Assert.True(state.Paused); Assert.Equal(0, state.RunningSeconds);
    }
    [Fact] public async Task DisconnectStopsProbesAndReconnectRefreshesGateway()
    {
        var probe = new Probe(); var network = new Network(); await using var engine = Engine(probe, network); await engine.InitializeAsync(); await Until(() => engine.Snapshot().Gateway.Samples.Length > 0);
        network.Value = new(false, null, "Disconnected", null, []); await engine.RefreshNetworkAsync(); var calls = probe.Calls.Values.Sum(); await Task.Delay(40); Assert.Equal(calls, probe.Calls.Values.Sum());
        network.Value = new(true, "nic2", "Wi-Fi", "192.168.2.1", []); await engine.RefreshNetworkAsync(); await Until(() => engine.Snapshot().Gateway.Samples.Length > 0);
        Assert.Equal("192.168.2.1", engine.Snapshot().Gateway.Target); Assert.All(engine.Snapshot().Gateway.Samples, s => Assert.Equal("192.168.2.1", s.Destination));
        Assert.Equal(0, probe.Overlaps);
    }
    [Fact] public async Task ReconnectDoesNotResumeAnExplicitPause()
    {
        var probe = new Probe(); var network = new Network(); await using var engine = Engine(probe, network); await engine.InitializeAsync(); await engine.SetPausedAsync(true);
        network.Value = new(false, null, "Offline", null, []); await engine.RefreshNetworkAsync(); network.Value = new(true, "nic1", "Ethernet", "192.168.1.1", []); await engine.RefreshNetworkAsync();
        var calls = probe.Calls.Values.Sum(); await Task.Delay(40); Assert.Equal(calls, probe.Calls.Values.Sum()); Assert.True(engine.Snapshot().Paused);
    }
    [Fact] public async Task ResumeRevalidatesAnAdapterChangedDuringPauseBeforeStartingWorkers()
    {
        var probe = new Probe(); var network = new Network(); await using var engine = Engine(probe, network);
        await engine.InitializeAsync(); await Until(() => engine.Snapshot().Gateway.Samples.Length > 0); await engine.SetPausedAsync(true);
        var oldCalls = probe.Calls.GetValueOrDefault("192.168.1.1");
        network.Value = new(true, "nic2", "New Wi-Fi", "192.168.2.1", []);
        await engine.SetPausedAsync(false); await Until(() => engine.Snapshot().Gateway.Samples.Length > 0);
        Assert.Equal(oldCalls, probe.Calls.GetValueOrDefault("192.168.1.1"));
        Assert.Equal("nic2", engine.Snapshot().Network.AdapterId);
        Assert.All(engine.Snapshot().Gateway.Samples, s => Assert.Equal("192.168.2.1", s.Destination));
    }
    [Fact] public async Task TargetChangeClearsOldSamplesAndCancelsOldWorkers()
    {
        var probe = new Probe(); await using var engine = Engine(probe); await engine.InitializeAsync(); await Until(() => engine.Snapshot().Internet.Samples.Length > 0);
        await engine.ConfigureAsync(new("192.168.3.1", "8.8.8.8", 500)); await Until(() => engine.Snapshot().Internet.Samples.Length > 0);
        Assert.All(engine.Snapshot().Internet.Samples, s => Assert.Equal("8.8.8.8", s.Destination)); Assert.All(engine.Snapshot().Gateway.Samples, s => Assert.Equal("192.168.3.1", s.Destination));
    }
    [Fact] public async Task ShutdownAwaitsCancellationOfBothWorkers()
    {
        var probe = new Probe { Handler = async (_, token) => { await Task.Delay(Timeout.Infinite, token); return new(ProbeStatus.Success, 1); } };
        var engine = Engine(probe); await engine.InitializeAsync(); await Until(() => probe.Active.Count == 2); await engine.DisposeAsync();
        Assert.All(probe.Active.Values, n => Assert.Equal(0, n));
    }
    [Fact] public async Task BufferIsBounded()
    {
        var probe = new Probe(); await using var engine = new MonitorEngine(probe, new Network(), interval: TimeSpan.FromMilliseconds(1)); await engine.InitializeAsync();
        await Until(() => probe.Calls.GetValueOrDefault("1.1.1.1") > MonitorEngine.Capacity + 5);
        await engine.SetPausedAsync(true); Assert.Equal(MonitorEngine.Capacity, engine.Snapshot().Internet.Samples.Length);
    }
    [Fact] public async Task InvalidSuccessfulRttBecomesAnError()
    {
        var probe = new Probe { Handler = (_, _) => Task.FromResult(new ProbeResult(ProbeStatus.Success, double.NaN)) };
        await using var engine = Engine(probe); await engine.InitializeAsync(); await Until(() => engine.Snapshot().Internet.Samples.Length > 0);
        Assert.All(engine.Snapshot().Internet.Samples, s => { Assert.Equal(ProbeStatus.Error, s.Status); Assert.Null(s.RttMs); });
    }
    [Fact] public async Task PausedWindowAndMetricsFreezeUntilResume()
    {
        var clock = new Clock(); var probe = new Probe(); await using var engine = Engine(probe, clock: clock);
        await engine.InitializeAsync(); await Until(() => engine.Snapshot().Internet.Samples.Length > 0); await engine.SetPausedAsync(true);
        var before = engine.Snapshot(); clock.Now = clock.Now.AddMinutes(10); var after = engine.Snapshot();
        Assert.Equal(before.Now, after.Now); Assert.Equal(before.Internet.Stats60, after.Internet.Stats60); Assert.Equal(before.RunningSeconds, after.RunningSeconds);
        await engine.SetPausedAsync(false); Assert.Equal(clock.Now, engine.Snapshot().Now);
    }
    [Fact] public async Task DuplicateEndpointAddressesAreRejectedWithoutChangingCurrentSession()
    {
        var probe = new Probe(); await using var engine = Engine(probe); await engine.InitializeAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => engine.ConfigureAsync(new("1.1.1.1", "1.1.1.1")));
        Assert.Equal("192.168.1.1", engine.Snapshot().Gateway.Target);
    }
    [Fact] public async Task AlreadyQueuedDeadlineCallbackAfterPauseCannotTouchDisposedLinkedSource()
    {
        var clock = new QueuedTimerClock(); var probe = new Probe(); await using var engine = Engine(probe, clock: clock);
        await engine.InitializeAsync(); await Until(() => engine.Snapshot().Internet.Samples.Length > 0 && engine.Snapshot().Gateway.Samples.Length > 0);
        await engine.SetPausedAsync(true);
        // Windows timers may already have queued callbacks when Dispose returns. Reproduce that
        // ordering deterministically instead of relying on a timing-sensitive stress test.
        Assert.Null(Record.Exception(clock.FireDisposedCallbacks));
        Assert.All(probe.Active.Values, n => Assert.Equal(0, n));
    }
}
