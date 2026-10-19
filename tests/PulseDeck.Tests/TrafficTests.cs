using PulseDeck.Core;
using Xunit;

namespace PulseDeck.Tests;

public class TrafficTests
{
    private sealed class Clock : TimeProvider { public override long TimestampFrequency => 1000; }
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-18T10:00:00Z");
    private readonly Clock _clock = new();
    [Theory]
    [InlineData(250, 250000, 8)]
    [InlineData(1000, 1000000, 8)]
    [InlineData(400, 50000000, 1000)]
    public void UsesMonotonicSecondsAndDecimalMegabits(int milliseconds, long bytes, double expected)
    {
        var c = new TrafficCalculator();
        Assert.Equal("baseline", c.Measure(new("a", 900, 800), 0, Now, _clock, 1).Status);
        var sample = c.Measure(new("a", 900 + bytes, 800 + bytes / 2), milliseconds, Now.AddDays(-1), _clock, 2);
        Assert.Equal(expected, sample.DownloadMbps); Assert.Equal(expected / 2, sample.UploadMbps);
        Assert.Equal(milliseconds / 1000d, sample.ElapsedSeconds); Assert.Equal(Now.AddDays(-1), sample.Timestamp);
    }
    [Fact] public void SubtractsIntegerCountersBeforeFloatingPointConversion()
    {
        var c = new TrafficCalculator();
        c.Measure(new("a", long.MaxValue - 100, long.MaxValue - 100), 0, Now, _clock, 1);
        var s = c.Measure(new("a", long.MaxValue - 50, long.MaxValue - 50), 250, Now, _clock, 2);
        Assert.Equal(.0016, s.DownloadMbps);
    }
    [Fact] public void ResetsWrapsSwitchesAndInvalidIntervalsNeverProduceSpeeds()
    {
        var c = new TrafficCalculator();
        c.Measure(new("a", 10000, 10000), 0, Now, _clock, 1);
        Assert.Null(c.Measure(new("a", 1, 1), 250, Now, _clock, 2).DownloadMbps);
        Assert.Null(c.Measure(new("b", 100000, 100000), 500, Now, _clock, 3).DownloadMbps);
        Assert.Null(c.Measure(new("b", -1, -1), 750, Now, _clock, 4).DownloadMbps);
        Assert.Null(c.Measure(new("b", 100, 100), 1000, Now, _clock, 5).DownloadMbps);
        Assert.Null(c.Measure(new("b", 100, 100), 1000, Now, _clock, 6).DownloadMbps);
        Assert.Null(c.Measure(new("b", 1000, 1000), 5000, Now, _clock, 7).DownloadMbps);
        Assert.Equal(0, c.Measure(new("b", 1000, 1000), 5250, Now, _clock, 8).DownloadMbps);
        c.Reset(); Assert.Null(c.Measure(new("b", 999999, 999999), 5500, Now, _clock, 9).DownloadMbps);
    }
    [Fact] public void AverageWeightsVariableIntervalsAndDoesNotModifyInstantaneousValue()
    {
        var c = new TrafficCalculator();
        c.Measure(new("a", 0, 0), 0, Now, _clock, 1);
        c.Measure(new("a", 1000000, 0), 250, Now, _clock, 2);
        var sample = c.Measure(new("a", 1000000, 0), 1000, Now, _clock, 3);
        Assert.Equal(0, sample.DownloadMbps); Assert.Equal(8, sample.DownloadAverage);
    }
    private sealed class Network : INetworkProvider { public NetworkState Value = new(true, "a", "Physical", "192.168.1.1", []); public NetworkState Read() => Value; }
    private sealed class Probe : IProbeProvider { public Task<ProbeResult> ProbeAsync(string destination, TimeSpan timeout, CancellationToken token) => Task.FromResult(new ProbeResult(ProbeStatus.Success, 5)); }
    private sealed class Traffic : ITrafficProvider
    {
        public int Calls; public bool Fail;
        public InterfaceCounters Read(string adapterId) { Interlocked.Increment(ref Calls); if (Fail) throw new InvalidOperationException("Driver unavailable"); return new(adapterId, Calls * 1000, Calls * 100); }
    }
    private static async Task Until(Func<bool> predicate) { using var c = new CancellationTokenSource(8000); while (!predicate()) await Task.Delay(10, c.Token); }
    [Fact] public async Task PauseResumeResetDisconnectAndReplacementShareAwaitedLifecycle()
    {
        var provider = new Traffic(); var network = new Network();
        await using var engine = new MonitorEngine(new Probe(), network, traffic: provider);
        await engine.InitializeAsync(); await Until(() => engine.Traffic!.Since(-1, 0).Samples.Any(s => s.Status == "measured"));
        await engine.SetPausedAsync(true); var calls = provider.Calls; await Task.Delay(300); Assert.Equal(calls, provider.Calls);
        var last = engine.Traffic!.Since(-1, 0).Samples[^1].Sequence;
        await engine.SetPausedAsync(false); await Until(() => provider.Calls > calls);
        Assert.Equal("baseline", engine.Traffic.Since(-1, last).Samples.First(s => s.Sequence > last).Status);
        network.Value = new(false, null, "Disconnected", null, []); await engine.RefreshNetworkAsync(); calls = provider.Calls; await Task.Delay(300); Assert.Equal(calls, provider.Calls);
        var generation = engine.Traffic.Since(-1, 0).Generation;
        network.Value = new(true, "b", "Replacement", "192.168.2.1", []); await engine.RefreshNetworkAsync();
        await Until(() => engine.Traffic.Since(-1, 0).Samples.Length > 0);
        Assert.True(engine.Traffic.Since(-1, 0).Generation > generation); Assert.Equal("baseline", engine.Traffic.Since(-1, 0).Samples[0].Status);
        await engine.SetPausedAsync(true); await engine.ResetAsync(); Assert.Empty(engine.Traffic.Since(-1, 0).Samples);
    }
    [Fact] public async Task FailedReadsRemainUnavailableAndRecoveryRebaselines()
    {
        var provider = new Traffic { Fail = true }; var monitor = new TrafficMonitor(provider, TimeProvider.System);
        using var c = new CancellationTokenSource(); var task = monitor.RunAsync("a", c.Token);
        await Until(() => monitor.Since(-1, 0).Samples.Length > 0); Assert.Equal("unavailable", monitor.Since(-1, 0).Samples[0].Status);
        provider.Fail = false; await Until(() => monitor.Since(-1, 0).Samples.Any(s => s.Status == "baseline"));
        await c.CancelAsync(); await task;
        var all = monitor.Since(-1, 0); Assert.Empty(monitor.Since(all.Generation, all.Samples[^1].Sequence).Samples);
    }
}
