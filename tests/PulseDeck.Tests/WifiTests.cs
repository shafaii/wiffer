using System.Buffers.Binary;
using PulseDeck.Core;
using Xunit;

namespace PulseDeck.Tests;
public class WifiTests
{
    [Fact] public void ParsesAssociationIdentityAndSecurityAtSdkOffsets()
    {
        var data = new byte[604]; U(data, 0, 1); U(data, 4, 4); U(data, 568, 10); U(data, 596, 9); U(data, 600, 4);
        new byte[] { 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff }.CopyTo(data, 560);
        var info = WifiParser.Connection(data);
        Assert.Equal("AA:BB:CC:DD:EE:FF", info.Bssid); Assert.Equal("802.11ax", info.RadioType);
        Assert.Equal("WPA3 SAE", info.Authentication); Assert.Equal("CCMP", info.Cipher); Assert.Equal("Automatic", info.ConnectionMode);
        Assert.Null(info.RxLinkMbps); Assert.Null(info.RssiDbm); Assert.Equal("connected", info.State);
        U(data, 568, 999); Assert.Equal("Unknown (999)", WifiParser.Connection(data).RadioType);
    }
    [Theory][InlineData(4, "disconnected")][InlineData(5, "associating")][InlineData(6, "discovering")][InlineData(7, "authenticating")][InlineData(999, null)]
    public void ReadsOnlyDefinedWindowsStates(uint value, string? expected) => Assert.Equal(expected, WifiParser.State(value));
    [Fact] public void DropsMixedObservationsOnDetectedRoamOrDisconnect()
    {
        var info = WifiParser.Realtime(Realtime()) with { Bssid = "AA:BB:CC:DD:EE:02", State = "connected" };
        var roam = WifiParser.Complete(info, "connected", "AA:BB:CC:DD:EE:01");
        Assert.Null(roam.RssiDbm); Assert.Null(roam.SignalQuality); Assert.Null(roam.Band); Assert.Null(roam.RxLinkMbps);
        var disconnected = WifiParser.Complete(info, "disconnected", info.Bssid);
        Assert.Equal("disconnected", disconnected.State); Assert.Null(disconnected.RssiDbm);
        Assert.Equal(info, WifiParser.Complete(info, "connected", info.Bssid));
        Assert.Equal(info, WifiParser.Complete(info, null, null)); // Privacy-limited identity never invents a change.
    }
    private static void U(byte[] bytes, int offset, uint value) => BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(offset), value);
    private static byte[] Realtime()
    {
        var data = new byte[296]; U(data, 4, 80); U(data, 8, 866700); U(data, 12, 72000); U(data, 20, 1); U(data, 28, 5180);
        BinaryPrimitives.WriteInt32LittleEndian(data.AsSpan(36), -61); return data;
    }
    [Fact] public void ReadsActualRssiFrequencyAndKbpsLinkRates()
    {
        var info = WifiParser.Realtime(Realtime());
        Assert.Equal(-61, info.RssiDbm); Assert.Equal((uint)80, info.SignalQuality); Assert.Equal("5 GHz", info.Band); Assert.Equal(36, info.Channel);
        Assert.Equal(866.7, info.RxLinkMbps); Assert.Equal(72, info.TxLinkMbps);
    }
    [Theory][InlineData(2412, "2.4 GHz", 1)][InlineData(2484, "2.4 GHz", 14)][InlineData(5955, "6 GHz", 1)]
    public void BandComesFromFrequencyNotAmbiguousChannel(uint frequency, string band, int channel)
    {
        var data = Realtime(); U(data, 28, frequency); var info = WifiParser.Realtime(data); Assert.Equal(band, info.Band); Assert.Equal(channel, info.Channel);
    }
    [Fact] public void RejectsShortOversizedAndOutOfRangeData()
    {
        Assert.Throws<ArgumentException>(() => WifiParser.Realtime(new byte[23]));
        var data = Realtime(); U(data, 20, uint.MaxValue); Assert.Throws<ArgumentException>(() => WifiParser.Realtime(data));
        U(data, 20, 1); U(data, 4, 101); Assert.Throws<ArgumentException>(() => WifiParser.Realtime(data));
        Assert.Throws<ArgumentException>(() => WifiParser.Connection(new byte[603]));
        var connection = new byte[604]; U(connection, 0, 1); U(connection, 520, 33); Assert.Throws<ArgumentException>(() => WifiParser.Connection(connection));
    }
    [Fact] public void DoesNotInventRssiFromSignalQualityOrCollapseMultipleLinks()
    {
        var data = Realtime(); U(data, 36, 0); Assert.Null(WifiParser.Realtime(data).RssiDbm);
        var multi = new byte[568]; data.CopyTo(multi, 0); U(multi, 20, 2); Assert.Null(WifiParser.Realtime(multi).Band);
        var connection = new byte[604]; U(connection, 0, 1); U(connection, 576, 100); Assert.Null(WifiParser.Connection(connection).RssiDbm);
    }
    [Fact] public void SsidUsesExplicitLengthAndInvalidUtf8IsDisplayedAsHex()
    {
        var data = new byte[604]; U(data, 0, 1); U(data, 520, 2); data[524] = 0xff; data[525] = 0xfe;
        Assert.Equal("0xFFFE", WifiParser.Connection(data).Ssid);
    }
}
