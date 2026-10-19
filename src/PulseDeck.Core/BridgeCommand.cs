using System.Text.Json;

namespace PulseDeck.Core;

public sealed record BridgeCommand(string Id, string Type, MonitorSettings? Settings = null)
{
    public static BridgeCommand Parse(string json)
    {
        if (json.Length > 4096) throw new ArgumentException("Message exceeds size limit.");
        using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 5 });
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object) throw new ArgumentException("Expected command object.");
        var allowed = new HashSet<string> { "version", "id", "type", "settings" };
        var seen = new HashSet<string>();
        foreach (var property in root.EnumerateObject()) if (!allowed.Contains(property.Name) || !seen.Add(property.Name)) throw new ArgumentException("Unknown or duplicate command field.");
        if (!root.TryGetProperty("version", out var version) || !version.TryGetInt32(out var v) || v != 2) throw new ArgumentException("Unsupported bridge version.");
        var id = root.GetProperty("id").GetString();
        var type = root.GetProperty("type").GetString();
        if (string.IsNullOrWhiteSpace(id) || id.Length > 64) throw new ArgumentException("Invalid command ID.");
        if (type is not ("ready" or "pause" or "resume" or "reset" or "configure")) throw new ArgumentException("Unknown command.");
        MonitorSettings? settings = null;
        if (type == "configure")
        {
            var value = root.GetProperty("settings");
            if (value.ValueKind != JsonValueKind.Object) throw new ArgumentException("Missing settings.");
            var names = value.EnumerateObject().Select(p => p.Name).ToArray();
            if (names.Length != 3 || names.Distinct().Count() != 3 || names.Except(["gatewayOverride", "internetTarget", "timeoutMs"]).Any()) throw new ArgumentException("Invalid settings fields.");
            settings = new(value.GetProperty("gatewayOverride").GetString(), value.GetProperty("internetTarget").GetString() ?? "", value.GetProperty("timeoutMs").GetInt32());
            if ((settings.GatewayOverride is not null && !MonitorEngine.IsTarget(settings.GatewayOverride)) || !MonitorEngine.IsTarget(settings.InternetTarget) || settings.TimeoutMs is < 250 or > 10000) throw new ArgumentException("Use IPv4 unicast targets and a timeout between 250 and 10000 ms.");
        }
        else if (seen.Contains("settings")) throw new ArgumentException("Unexpected settings.");
        return new(id, type, settings);
    }
}
