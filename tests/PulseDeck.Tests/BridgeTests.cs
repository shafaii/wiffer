using PulseDeck.Core;
using Xunit;

namespace PulseDeck.Tests;
public class BridgeTests
{
    [Theory]
    [InlineData("{\"version\":3,\"id\":\"1\",\"type\":\"pause\"}")]
    [InlineData("{\"version\":2,\"id\":\"1\",\"type\":\"runShell\"}")]
    [InlineData("{\"version\":2,\"id\":\"1\",\"type\":\"pause\",\"extra\":true}")]
    [InlineData("{\"version\":2,\"id\":\"1\",\"type\":\"pause\",\"type\":\"resume\"}")]
    [InlineData("{\"version\":2,\"id\":\"1\",\"type\":\"configure\",\"settings\":{\"gatewayOverride\":null,\"internetTarget\":\"example.com\",\"timeoutMs\":2500}}")]
    [InlineData("{\"version\":2,\"id\":\"1\",\"type\":\"configure\",\"settings\":{\"gatewayOverride\":null,\"internetTarget\":\"1.1.1.1\",\"timeoutMs\":0}}")]
    public void RejectsInvalidCommands(string json) => Assert.ThrowsAny<Exception>(() => BridgeCommand.Parse(json));
    [Fact] public void ParsesTypedConfiguration()
    {
        var result = BridgeCommand.Parse("{\"version\":2,\"id\":\"a\",\"type\":\"configure\",\"settings\":{\"gatewayOverride\":\"192.168.2.1\",\"internetTarget\":\"1.1.1.1\",\"timeoutMs\":2500}}");
        Assert.Equal("configure", result.Type); Assert.Equal("192.168.2.1", result.Settings!.GatewayOverride);
    }
    [Theory][InlineData("0.0.0.0")][InlineData("224.0.0.1")][InlineData("255.255.255.255")][InlineData("1.1.1")][InlineData("01.1.1.1")][InlineData("::1")]
    public void RejectsUnsafeOrNonCanonicalTargets(string target) => Assert.False(MonitorEngine.IsTarget(target));
}
