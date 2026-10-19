namespace PulseDeck.Core;

public sealed record InterfaceCounters(string AdapterId, long Received, long Sent);
public interface ITrafficProvider { InterfaceCounters Read(string adapterId); }
public sealed record TrafficSample(long Sequence, DateTimeOffset Timestamp, double ElapsedSeconds, string Status,
    double? DownloadMbps, double? UploadMbps, double? DownloadAverage, double? UploadAverage, string? Error);
public sealed record TrafficBatch(long Generation, TrafficSample[] Samples);

// A baseline is never carried across pause, a failed read, or adapter replacement.
public sealed class TrafficCalculator
{
    private InterfaceCounters? _previous;
    private long _stamp;
    private readonly Queue<(double Seconds, double Down, double Up)> _average = new();
    public void Reset() { _previous = null; _average.Clear(); }
    public TrafficSample Measure(InterfaceCounters counters, long stamp, DateTimeOffset timestamp, TimeProvider clock, long sequence)
    {
        var previous = _previous;
        var elapsed = previous is null ? 0 : clock.GetElapsedTime(_stamp, stamp).TotalSeconds;
        _previous = counters; _stamp = stamp;
        string? reason = counters.Received < 0 || counters.Sent < 0 ? "Invalid interface counters" :
            previous is null || previous.AdapterId != counters.AdapterId ? "Establishing adapter baseline" :
            counters.Received < previous.Received || counters.Sent < previous.Sent ? "Counters reset or wrapped; establishing a new baseline" :
            !double.IsFinite(elapsed) || elapsed <= 0 || elapsed > 2 ? "Sampling gap; establishing a new baseline" : null;
        if (reason is not null)
        {
            _average.Clear();
            if (counters.Received < 0 || counters.Sent < 0) _previous = null;
            return new(sequence, timestamp, Math.Max(0, double.IsFinite(elapsed) ? elapsed : 0), "baseline", null, null, null, null, reason);
        }
        // Subtract integers first so large cumulative byte counts retain small deltas.
        var down = (counters.Received - previous!.Received) * 8d / (elapsed * 1_000_000);
        var up = (counters.Sent - previous.Sent) * 8d / (elapsed * 1_000_000);
        _average.Enqueue((elapsed, down, up));
        while (_average.Count > 64 || (_average.Count > 1 && _average.Sum(v => v.Seconds) - _average.Peek().Seconds >= 3)) _average.Dequeue();
        var duration = _average.Sum(v => v.Seconds);
        return new(sequence, timestamp, elapsed, "measured", down, up,
            _average.Sum(v => v.Down * v.Seconds) / duration, _average.Sum(v => v.Up * v.Seconds) / duration, null);
    }
}

public sealed class TrafficMonitor(ITrafficProvider provider, TimeProvider clock)
{
    public const int Capacity = 1204;
    private readonly object _sync = new();
    private readonly Queue<TrafficSample> _samples = new();
    private long _sequence;
    private long _generation;
    public void Clear() { lock (_sync) { _samples.Clear(); _generation++; } }
    public TrafficBatch Since(long generation, long sequence)
    {
        lock (_sync) return new(_generation, _samples.Where(s => generation != _generation || s.Sequence > sequence).ToArray());
    }
    public async Task RunAsync(string adapterId, CancellationToken token)
    {
        var calculator = new TrafficCalculator();
        try
        {
            while (!token.IsCancellationRequested)
            {
                var start = clock.GetTimestamp();
                TrafficSample sample;
                try
                {
                    var counters = provider.Read(adapterId);
                    sample = calculator.Measure(counters, clock.GetTimestamp(), clock.GetUtcNow(), clock, ++_sequence);
                }
                catch (Exception ex)
                {
                    calculator.Reset();
                    sample = new(++_sequence, clock.GetUtcNow(), 0, "unavailable", null, null, null, null, ex.Message);
                }
                token.ThrowIfCancellationRequested();
                lock (_sync) { _samples.Enqueue(sample); while (_samples.Count > Capacity) _samples.Dequeue(); }
                var delay = TimeSpan.FromMilliseconds(250) - clock.GetElapsedTime(start);
                await Task.Delay(delay > TimeSpan.Zero ? delay : TimeSpan.FromMilliseconds(10), clock, token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
    }
}
