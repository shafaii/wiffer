using System.Buffers.Binary;
using System.Runtime.InteropServices;
using System.Text;

namespace PulseDeck.Core;

// Bounded parsers are separated from P/Invoke so malformed/short driver responses can be tested.
public static class WifiParser
{
    private static uint U(ReadOnlySpan<byte> data, int offset) => BinaryPrimitives.ReadUInt32LittleEndian(data[offset..]);
    public static WifiInfo Realtime(ReadOnlySpan<byte> data)
    {
        if (data.Length < 24) throw new ArgumentException("Truncated real-time Wi-Fi header");
        var count = U(data, 20);
        if (count is < 1 or > 16 || data.Length < 24 + count * 272 || U(data, 4) > 100) throw new ArgumentException("Invalid real-time Wi-Fi links or quality");
        var rssi = BinaryPrimitives.ReadInt32LittleEndian(data[36..]);
        var frequency = U(data, 28);
        // MLO is not collapsed into a fictitious single radio measurement.
        var single = count == 1;
        var band = !single ? null : frequency is >= 2400 and <= 2500 ? "2.4 GHz" : frequency is >= 4900 and < 5925 ? "5 GHz" : frequency is >= 5925 and <= 7125 ? "6 GHz" : null;
        int? channel = !single ? null : frequency == 2484 ? 14 : frequency is >= 2412 and <= 2472 && (frequency - 2407) % 5 == 0 ? (int)(frequency - 2407) / 5 :
            frequency == 5935 ? 2 : frequency is >= 5955 and <= 7115 && (frequency - 5950) % 5 == 0 ? (int)(frequency - 5950) / 5 :
            frequency is >= 5000 and < 5925 && frequency % 5 == 0 ? (int)(frequency - 5000) / 5 : null;
        return new(null, band, channel, single && rssi is >= -127 and <= -1 ? rssi : null, U(data, 4),
            U(data, 8) == 0 ? null : U(data, 8) / 1000d, U(data, 12) == 0 ? null : U(data, 12) / 1000d,
            single ? band is null || rssi is < -127 or > -1 ? "Driver returned unavailable radio frequency/RSSI" : null : "Multiple Wi-Fi links: per-link band/channel/RSSI are not aggregated");
    }
    public static WifiInfo Connection(ReadOnlySpan<byte> data)
    {
        if (data.Length < 604 || U(data, 0) != 1 || U(data, 520) > 32 || U(data, 576) > 100) throw new ArgumentException("Malformed or disconnected WLAN connection attributes");
        var ssid = data.Slice(524, (int)U(data, 520));
        string name;
        try { name = new UTF8Encoding(false, true).GetString(ssid); }
        catch (DecoderFallbackException) { name = "0x" + Convert.ToHexString(ssid); }
        name = new string(name.Select(c => char.IsControl(c) ? '\uFFFD' : c).ToArray());
        return new(name.Length == 0 ? null : name, null, null, null, U(data, 576), U(data, 580) == 0 ? null : U(data, 580) / 1000d,
            U(data, 584) == 0 ? null : U(data, 584) / 1000d, null);
    }
}

public static class NativeWifi
{
    [DllImport("wlanapi.dll")] private static extern uint WlanOpenHandle(uint version, IntPtr reserved, out uint negotiated, out IntPtr handle);
    [DllImport("wlanapi.dll")] private static extern uint WlanCloseHandle(IntPtr handle, IntPtr reserved);
    [DllImport("wlanapi.dll")] private static extern uint WlanQueryInterface(IntPtr handle, ref Guid id, uint opcode, IntPtr reserved, out uint size, out IntPtr data, out uint type);
    [DllImport("wlanapi.dll")] private static extern void WlanFreeMemory(IntPtr memory);
    public static WifiInfo Read(string adapterId)
    {
        var notes = new List<string>();
        WifiInfo info = new(null, null, null, null, null, null, null, null);
        IntPtr handle = IntPtr.Zero;
        try
        {
            if (!Guid.TryParse(adapterId, out var id)) throw new ArgumentException("Adapter ID is not a Wi-Fi GUID");
            var opened = WlanOpenHandle(2, IntPtr.Zero, out _, out handle);
            if (opened != 0) throw new InvalidOperationException($"WLAN service unavailable ({opened})");
            byte[]? Query(uint opcode, string label)
            {
                IntPtr pointer = IntPtr.Zero;
                try
                {
                    var result = WlanQueryInterface(handle, ref id, opcode, IntPtr.Zero, out var size, out pointer, out _);
                    if (result != 0) { notes.Add(result == 5 ? $"{label}: Windows denied access; location privacy may restrict SSID" : $"{label}: unavailable from Windows/driver ({result})"); return null; }
                    if (pointer == IntPtr.Zero || size is 0 or > 16384) { notes.Add($"{label}: invalid driver response size"); return null; }
                    var bytes = new byte[size]; Marshal.Copy(pointer, bytes, 0, (int)size); return bytes;
                }
                finally { if (pointer != IntPtr.Zero) WlanFreeMemory(pointer); }
            }
            if (Query(19, "Real-time radio quality") is { } realtime)
                try { info = WifiParser.Realtime(realtime); } catch (ArgumentException ex) { notes.Add(ex.Message); }
            if (Query(7, "SSID / association") is { } connection)
                try { var c = WifiParser.Connection(connection); info = info with { Ssid = c.Ssid, SignalQuality = info.SignalQuality ?? c.SignalQuality, RxLinkMbps = info.RxLinkMbps ?? c.RxLinkMbps, TxLinkMbps = info.TxLinkMbps ?? c.TxLinkMbps }; } catch (ArgumentException ex) { notes.Add(ex.Message); }
            var multipleLinks = info.UnavailableReason?.StartsWith("Multiple Wi-Fi", StringComparison.Ordinal) == true;
            if (!multipleLinks && info.RssiDbm is null && Query(0x10000102, "RSSI") is { Length: >= 4 } rssi)
            {
                var dbm = BinaryPrimitives.ReadInt32LittleEndian(rssi);
                if (dbm is >= -127 and <= -1) info = info with { RssiDbm = dbm }; else notes.Add("RSSI: invalid driver value");
            }
            if (!multipleLinks && info.Channel is null && Query(8, "Channel") is { Length: >= 4 } channel)
            {
                var ch = BinaryPrimitives.ReadUInt32LittleEndian(channel);
                if (ch is > 0 and <= 233) info = info with { Channel = (int)ch };
                // A channel number alone cannot distinguish 2.4/5/6 GHz.
            }
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or DllNotFoundException or EntryPointNotFoundException) { notes.Add(ex.Message); }
        finally { if (handle != IntPtr.Zero) WlanCloseHandle(handle, IntPtr.Zero); }
        if (info.UnavailableReason is not null) notes.Add(info.UnavailableReason);
        return info with { UnavailableReason = notes.Count == 0 ? null : string.Join("; ", notes) };
    }
}
