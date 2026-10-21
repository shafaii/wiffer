using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace PulseDeck.Core;

[SupportedOSPlatform("windows")]
public sealed class WindowsNetworkProvider : INetworkProvider, ITrafficProvider
{
    private string? _lastWifiId;
    [DllImport("iphlpapi.dll", ExactSpelling = true)] private static extern int GetBestInterface(uint destination, out uint bestInterfaceIndex);
    [DllImport("iphlpapi.dll", ExactSpelling = true)] private static extern uint GetIfEntry2(ref InterfaceRow row);
    [DllImport("iphlpapi.dll", ExactSpelling = true)] private static extern uint ConvertInterfaceGuidToLuid(in Guid guid, out ulong luid);
    // MIB_IF_ROW2, Windows SDK default 8-byte packing. Only fields used here are projected.
    [StructLayout(LayoutKind.Explicit, Size = 1352)]
    private struct InterfaceRow
    {
        [FieldOffset(0)] public ulong Luid;
        [FieldOffset(8)] public uint Index;
        [FieldOffset(12)] public Guid Guid;
        [FieldOffset(1152)] public byte Flags;
        [FieldOffset(1156)] public uint OperationalStatus;
        [FieldOffset(1208)] public ulong InOctets;
        [FieldOffset(1280)] public ulong OutOctets;
    }
    public NetworkState Read()
    {
        var result = GetBestInterface(BitConverter.ToUInt32(IPAddress.Parse("1.1.1.1").GetAddressBytes()), out var best);
        var adapters = NetworkInterface.GetAllNetworkInterfaces();
        var candidates = new List<(AdapterInfo Info, NetworkInterface Nic, int Index)>();
        foreach (var nic in adapters.Where(n => n.OperationalStatus == OperationalStatus.Up))
        {
            try
            {
                var properties = nic.GetIPProperties();
                var index = properties.GetIPv4Properties()?.Index;
                if (index is null) continue;
                var row = new InterfaceRow { Index = (uint)index };
                if (GetIfEntry2(ref row) != 0 || (row.Flags & 1) == 0 || (row.Flags & 2) != 0) continue;
                var address = properties.UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetwork)?.Address;
                var gateway = properties.GatewayAddresses.FirstOrDefault(g => g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any))?.Address;
                if (address is not null && gateway is not null) candidates.Add((new(nic.Id, nic.Name, address.ToString(), gateway.ToString()), nic, index.Value));
            }
            catch (NetworkInformationException) { }
        }
        var selected = candidates.OrderByDescending(c => result == 0 && c.Index == best).ThenBy(c => c.Index).FirstOrDefault();
        var anyUp = adapters.Any(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback);
        if (selected.Info is null)
        {
            // Retain only the previously selected physical Wi-Fi identity for read-only reconnect state.
            // It must not become a traffic/probe route before Windows supplies an operational gateway.
            var previous = adapters.FirstOrDefault(n => n.Id == _lastWifiId && n.NetworkInterfaceType == NetworkInterfaceType.Wireless80211);
            return new(anyUp, null, previous?.Name ?? (anyUp ? "Physical adapter unavailable" : "No active network"), null, [],
                anyUp ? "No operational physical IPv4 adapter with a gateway was found. Local traffic is unavailable; configured ICMP targets still use Windows routing." : null,
                previous is null ? null : new("Wi-Fi", previous.OperationalStatus.ToString(), "Previously selected Wi-Fi; awaiting an operational IPv4 route", null, null, null, null, null, null, null, NativeWifi.Read(previous.Id)));
        }
        string? rx = null, tx = null, re = null, te = null, rd = null, td = null, counterError = null;
        try
        {
            var stats = selected.Nic.GetIPStatistics();
            static string? Counter(long n) => n < 0 ? null : n.ToString(System.Globalization.CultureInfo.InvariantCulture);
            rx = Counter(stats.BytesReceived); tx = Counter(stats.BytesSent);
            re = Counter(stats.IncomingPacketsWithErrors); te = Counter(stats.OutgoingPacketsWithErrors);
            rd = Counter(stats.IncomingPacketsDiscarded); td = Counter(stats.OutgoingPacketsDiscarded);
        }
        catch (Exception ex) when (ex is NetworkInformationException or PlatformNotSupportedException) { counterError = ex.Message; }
        var wifi = selected.Nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211;
        _lastWifiId = wifi ? selected.Info.Id : null;
        var mac = selected.Nic.GetPhysicalAddress().GetAddressBytes();
        var selection = result == 0 && selected.Index == best ? "Physical adapter on Windows route to 1.1.1.1" :
            "Physical gateway fallback; Windows route may use a VPN or another adapter";
        return new(true, selected.Info.Id, selected.Info.Name, selected.Info.Gateway, candidates.Select(c => c.Info).ToArray(), null,
            new(wifi ? "Wi-Fi" : selected.Nic.NetworkInterfaceType.ToString(), selected.Nic.OperationalStatus.ToString(), selection,
                rx, tx, re, te, rd, td, counterError, wifi ? NativeWifi.Read(selected.Info.Id) with { Mac = mac.Length == 6 ? string.Join(":", mac.Select(b => b.ToString("X2"))) : null } : null));
    }
    InterfaceCounters ITrafficProvider.Read(string adapterId)
    {
        // Resolve identity every time: interface indexes can be reused after removal.
        // GetIfEntry2 reads the same interface octet counters without enumerating all adapters.
        if (!Guid.TryParse(adapterId, out var guid) || ConvertInterfaceGuidToLuid(in guid, out var luid) != 0)
            throw new InvalidOperationException("Selected adapter was removed or replaced");
        var row = new InterfaceRow { Luid = luid };
        if (GetIfEntry2(ref row) != 0 || row.Guid != guid || row.OperationalStatus != 1 || (row.Flags & 3) != 1)
            throw new InvalidOperationException("Selected physical adapter is unavailable or disconnected");
        if (row.InOctets > long.MaxValue || row.OutOctets > long.MaxValue)
            throw new InvalidOperationException("Interface counters exceed the supported signed range");
        return new(adapterId, (long)row.InOctets, (long)row.OutOctets);
    }
}
