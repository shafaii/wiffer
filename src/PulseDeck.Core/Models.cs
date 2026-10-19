namespace PulseDeck.Core;

public enum ProbeStatus { Success, Timeout, Error }
public sealed record ProbeResult(ProbeStatus Status, double? RttMs, string? Error = null);
public sealed record Sample(DateTimeOffset Timestamp, string Destination, double? RttMs, ProbeStatus Status, string? Error);
public sealed record AdapterInfo(string Id, string Name, string Address, string Gateway);
public sealed record WifiInfo(string? Ssid, string? Band, int? Channel, int? RssiDbm, uint? SignalQuality, double? RxLinkMbps, double? TxLinkMbps, string? UnavailableReason);
public sealed record ConnectionInfo(string Type, string OperationalState, string Selection, string? BytesReceived, string? BytesSent,
    string? ReceiveErrors, string? SendErrors, string? ReceiveDiscards, string? SendDiscards, string? CounterError, WifiInfo? Wifi);
public sealed record NetworkState(bool Connected, string? AdapterId, string AdapterName, string? Gateway, AdapterInfo[] Adapters, string? Error = null, ConnectionInfo? Details = null);
public sealed record MonitorSettings(string? GatewayOverride = null, string InternetTarget = "1.1.1.1", int TimeoutMs = 2500);
public sealed record Metrics(int Sent, int Successful, int Timeouts, int Errors, double? LossPercent, double? Min, double? Average, double? Max, double? Median, double? P95, double? Variation);
public sealed record EndpointSnapshot(string Id, string? Target, Sample[] Samples, Metrics Stats60, Metrics Stats300);
public sealed record MonitorSnapshot(DateTimeOffset Now, DateTimeOffset SessionStarted, double RunningSeconds, bool Paused, NetworkState Network, MonitorSettings Settings, EndpointSnapshot Gateway, EndpointSnapshot Internet);

public interface IProbeProvider
{
    Task<ProbeResult> ProbeAsync(string destination, TimeSpan timeout, CancellationToken cancellationToken);
}
public interface INetworkProvider { NetworkState Read(); }

public static class Statistics
{
    public static Metrics Calculate(IEnumerable<Sample> samples, DateTimeOffset now, TimeSpan window)
    {
        var measured = samples.Where(s => s.Timestamp > now - window && s.Timestamp <= now).ToArray();
        var values = measured.Where(s => s.Status == ProbeStatus.Success && s.RttMs.HasValue).Select(s => s.RttMs!.Value).ToArray();
        var sorted = values.Order().ToArray();
        var count = sorted.Length;
        double? median = count == 0 ? null : count % 2 == 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[count / 2];
        double? variation = count < 2 ? null : values.Zip(values.Skip(1), (a, b) => Math.Abs(a - b)).Average();
        return new(measured.Length, count, measured.Count(s => s.Status == ProbeStatus.Timeout), measured.Count(s => s.Status == ProbeStatus.Error),
            measured.Length == 0 ? null : 100d * (measured.Length - count) / measured.Length,
            count == 0 ? null : sorted[0], count == 0 ? null : values.Average(), count == 0 ? null : sorted[^1], median,
            count == 0 ? null : sorted[(int)Math.Ceiling(count * .95) - 1], variation);
    }
}
