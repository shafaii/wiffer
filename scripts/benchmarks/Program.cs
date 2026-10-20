using System.Diagnostics;
using System.Text.Json;
using PulseDeck.Core;

// Explicit local development benchmark. No automatic test, no persisted identifiers.
var provider = new WindowsNetworkProvider();
var network = provider.Read();
if (network.AdapterId is null) throw new InvalidOperationException("No physical adapter for benchmark.");
// Bracket the native read with the previous managed API to verify the SDK offsets and units on this PC.
var nic = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces().Single(n => n.Id == network.AdapterId);
for(var i=0;i<20;i++) {
    var before = nic.GetIPStatistics();
    var native = ((ITrafficProvider)provider).Read(network.AdapterId);
    var after = nic.GetIPStatistics();
    if(native.Received < before.BytesReceived || native.Received > after.BytesReceived || native.Sent < before.BytesSent || native.Sent > after.BytesSent)
        throw new InvalidOperationException("Native byte counters do not match the managed API.");
}
Console.WriteLine("20 native/managed byte-counter comparisons passed.");
var rows = new List<object>();
async Task Measure(string name, double hz, Func<Task> read, int seconds = 6)
{
    var process = Process.GetCurrentProcess(); var cpu = process.TotalProcessorTime;
    var durations = new List<double>(); var intervals = new List<double>(); var start = Stopwatch.StartNew(); var last = 0d;
    var errors = 0; var count = 0;
    while (start.Elapsed.TotalSeconds < seconds)
    {
        var before = start.Elapsed.TotalMilliseconds;
        if (count > 0) intervals.Add(before - last);
        last = before;
        try { await read(); } catch { errors++; }
        var elapsed = start.Elapsed.TotalMilliseconds - before; durations.Add(elapsed); count++;
        await Task.Delay(TimeSpan.FromMilliseconds(Math.Max(1, 1000 / hz - elapsed)));
    }
    static double P(List<double> data, double p) => data.Order().ElementAt(Math.Min(data.Count - 1, (int)Math.Ceiling(data.Count * p) - 1));
    rows.Add(new { provider = name, requestedHz = hz, observedHz = 1000 / intervals.Average(), readP50Ms = P(durations,.5), readP95Ms=P(durations,.95),
        intervalP95Ms=P(intervals,.95), intervalMaxMs=intervals.Max(), cpuOneCorePercent=(process.TotalProcessorTime-cpu).TotalSeconds / start.Elapsed.TotalSeconds*100, count, errors });
    Console.WriteLine(JsonSerializer.Serialize(rows[^1]));
}
foreach(var hz in new[] {4d,8,16,32}) await Measure("physical-interface counters", hz, () => { ((ITrafficProvider)provider).Read(network.AdapterId); return Task.CompletedTask; });
foreach(var hz in new[] {1d/3,1,2}) await Measure("adapter + Wi-Fi inspector", hz, () => { provider.Read(); return Task.CompletedTask; }, 9);
var probe = new NativeProbe();
if (network.Gateway is {} gateway)
    foreach(var hz in new[] {1d,2,4}) await Measure("gateway ICMP (sequential)", hz, async () => { await probe.ProbeAsync(gateway,TimeSpan.FromMilliseconds(1000),CancellationToken.None); });
await Measure("public ICMP (1 Hz ceiling)", 1, async () => { await probe.ProbeAsync("1.1.1.1",TimeSpan.FromMilliseconds(1000),CancellationToken.None); });
Directory.CreateDirectory("artifacts/validation");
await File.WriteAllTextAsync("artifacts/validation/provider-benchmark-m07.json",JsonSerializer.Serialize(rows,new JsonSerializerOptions{WriteIndented=true}));
