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
    private long _latestTimestamp;
    private double _latestReadMs;
    public event Action? SampleAvailable;
    public double LatestAgeMs { get { lock (_sync) return _latestTimestamp == 0 ? 0 : Math.Max(0, clock.GetElapsedTime(_latestTimestamp).TotalMilliseconds); } }
    public double LatestReadMs { get { lock (_sync) return _latestReadMs; } }
    public void Clear() { lock (_sync) { _samples.Clear(); _generation++; _latestTimestamp = 0; _latestReadMs = 0; } }
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
                var completed = start;
                TrafficSample sample;
                try
                {
                    var counters = provider.Read(adapterId);
                    completed = clock.GetTimestamp();
                    sample = calculator.Measure(counters, completed, clock.GetUtcNow(), clock, _sequence + 1);
                }
                catch (Exception ex)
                {
                    completed = clock.GetTimestamp();
                    calculator.Reset();
                    sample = new(_sequence + 1, clock.GetUtcNow(), 0, "unavailable", null, null, null, null, ex.Message);
                }
                token.ThrowIfCancellationRequested();
                ++_sequence;
                lock (_sync) { _latestTimestamp = completed; _latestReadMs = clock.GetElapsedTime(start, completed).TotalMilliseconds; _samples.Enqueue(sample); while (_samples.Count > Capacity) _samples.Dequeue(); }
                SampleAvailable?.Invoke();
                var delay = TimeSpan.FromMilliseconds(250) - clock.GetElapsedTime(start);
                await Task.Delay(delay > TimeSpan.Zero ? delay : TimeSpan.FromMilliseconds(10), clock, token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
    }
}
