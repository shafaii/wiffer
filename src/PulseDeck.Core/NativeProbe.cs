using System.Net;
using System.Net.NetworkInformation;

namespace PulseDeck.Core;

public sealed class NativeProbe : IProbeProvider
{
    private static readonly byte[] Payload = new byte[32];
    public async Task<ProbeResult> ProbeAsync(string destination, TimeSpan timeout, CancellationToken cancellationToken)
    {
        using var ping = new Ping();
        try
        {
            var reply = await ping.SendPingAsync(IPAddress.Parse(destination), timeout, Payload, new PingOptions(64, false), cancellationToken).ConfigureAwait(false);
            return reply.Status switch
            {
                IPStatus.Success => new(ProbeStatus.Success, reply.RoundtripTime),
                IPStatus.TimedOut => new(ProbeStatus.Timeout, null, "ICMP reply timed out"),
                _ => new(ProbeStatus.Error, null, reply.Status.ToString())
            };
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex) when (ex is PingException or System.Net.Sockets.SocketException or InvalidOperationException)
        {
            return new(ProbeStatus.Error, null, ex.InnerException?.Message ?? ex.Message);
        }
    }
}
