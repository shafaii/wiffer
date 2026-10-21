using System.Buffers.Binary;
using System.Runtime.InteropServices;
using System.Text;

namespace PulseDeck.Core;

// Bounded parsers are separated from P/Invoke so malformed/short driver responses can be tested.
public static class WifiParser
{
    public static string? State(uint value) => value switch { 0 => "unavailable", 1 => "connected", 2 => "ad-hoc", 3 => "disconnecting", 4 => "disconnected", 5 => "associating", 6 => "discovering", 7 => "authenticating", _ => null };
    private static string EnumLabel(uint value, params string[] names) => value < names.Length ? names[value] : $"Unknown ({value})";
    public static WifiInfo Complete(WifiInfo info, string? finalState, string? initialBssid)
    {
        if ((finalState is not null && finalState != "connected") ||
            (initialBssid is not null && info.Bssid is not null && initialBssid != info.Bssid))
            return new(null, null, null, null, null, null, null, "Connection changed during radio query; awaiting a consistent observation", State: finalState);
        return info with { State = finalState ?? info.State };
    }
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
            U(data, 584) == 0 ? null : U(data, 584) / 1000d, null,
            State: "connected", Bssid: data.Slice(560, 6).IndexOfAnyExcept((byte)0) < 0 ? null : string.Join(":", data.Slice(560, 6).ToArray().Select(b => b.ToString("X2"))),
            RadioType: EnumLabel(U(data, 568), "Unknown", "FHSS", "DSSS", "IR baseband", "802.11a", "802.11b", "802.11g", "802.11n", "802.11ac", "802.11ad", "802.11ax", "802.11be"),
            Authentication: EnumLabel(U(data, 596), "Unknown", "Open", "Shared key", "WPA Enterprise", "WPA Personal", "WPA none", "WPA2 Enterprise", "WPA2 Personal", "WPA3 Enterprise 192-bit", "WPA3 SAE", "OWE", "WPA3 Enterprise"),
            Cipher: U(data, 600) switch { 0 => "None", 1 => "WEP-40", 2 => "TKIP", 4 => "CCMP", 5 => "WEP-104", 6 => "BIP", 8 => "GCMP", 9 => "GCMP-256", 10 => "CCMP-256", 0x101 => "WEP", var v => $"Unknown ({v})" },
            ConnectionMode: EnumLabel(U(data, 4), "Profile", "Temporary profile", "Discovery secure", "Discovery unsecure", "Automatic", "Invalid"));
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
            string? ReadState() => Query(6, "Interface state") is { Length: >= 4 } state ? WifiParser.State(BinaryPrimitives.ReadUInt32LittleEndian(state)) : null;
            var before = ReadState();
            if (before is not null && before != "connected") return info with { State = before, UnavailableReason = "Wi-Fi interface is " + before };
            string? initialBssid = null;
            if (Query(7, "Association identity") is { } initial)
                try { initialBssid = WifiParser.Connection(initial).Bssid; } catch (ArgumentException ex) { notes.Add(ex.Message); }
            if (Query(19, "Real-time radio quality") is { } realtime)
                try { info = WifiParser.Realtime(realtime); } catch (ArgumentException ex) { notes.Add(ex.Message); }
            if (Query(7, "SSID / association") is { } connection)
                try { var c = WifiParser.Connection(connection); info = info with { Ssid = c.Ssid, State = c.State, Bssid = c.Bssid, RadioType = c.RadioType, Authentication = c.Authentication, Cipher = c.Cipher, ConnectionMode = c.ConnectionMode, SignalQuality = info.SignalQuality ?? c.SignalQuality, RxLinkMbps = info.RxLinkMbps ?? c.RxLinkMbps, TxLinkMbps = info.TxLinkMbps ?? c.TxLinkMbps }; } catch (ArgumentException ex) { notes.Add(ex.Message); }
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
            var after = ReadState();
            info = WifiParser.Complete(info, after ?? before, initialBssid);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or DllNotFoundException or EntryPointNotFoundException) { notes.Add(ex.Message); }
        finally { if (handle != IntPtr.Zero) WlanCloseHandle(handle, IntPtr.Zero); }
        if (info.UnavailableReason is not null) notes.Add(info.UnavailableReason);
        return info with { UnavailableReason = notes.Count == 0 ? null : string.Join("; ", notes) };
    }
}
