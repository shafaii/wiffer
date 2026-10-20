using System.Net;
using PulseDeck.Core;
using Xunit;

namespace PulseDeck.Tests;

public class SpeedTestTests
{
    private sealed class Handler(string behavior = "success") : HttpMessageHandler
    {
        public int Active, Peak, Requests;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            Interlocked.Increment(ref Requests);
            var active = Interlocked.Increment(ref Active); Peak = Math.Max(Peak, active);
            try
            {
                Assert.Equal("https", request.RequestUri!.Scheme);
                Assert.Equal("speed.cloudflare.com", request.RequestUri.Host);
                if (request.RequestUri.Query == "?bytes=0") return new(HttpStatusCode.OK) { Content = new ByteArrayContent([]) };
                if (behavior == "slow" || (behavior == "slowUpload" && request.Method == HttpMethod.Post)) await Task.Delay(Timeout.Infinite, token);
                await Task.Delay(12, token);
                if (behavior == "failed") return new(HttpStatusCode.ServiceUnavailable);
                if (behavior == "redirect") return new(HttpStatusCode.Redirect);
                if (request.Method == HttpMethod.Post)
                {
                    var data = await request.Content!.ReadAsByteArrayAsync(token);
                    Assert.Equal(1_000_000, data.Length);
                    return new(HttpStatusCode.OK) { Content = new ByteArrayContent([]) };
                }
                return new(HttpStatusCode.OK) { Content = new ByteArrayContent(new byte[behavior == "truncated" ? 10 : 4_000_000]) };
            }
            finally { Interlocked.Decrement(ref Active); }
        }
    }
    private static async Task<SpeedTestState> Wait(QuickSpeedTest test)
    {
        using var deadline = new CancellationTokenSource(5000);
        while (test.Snapshot().Status == "running") await Task.Delay(10, deadline.Token);
        return test.Snapshot();
    }
    [Theory]
    [InlineData(125000000L, 1, 1000)]
    [InlineData(250000L, .25, 8)]
    [InlineData(0L, 3, 0)]
    public void DecimalMegabitsUseTransferredBytesAndElapsedTime(long bytes, double seconds, double expected)
        => Assert.Equal(expected, QuickSpeedTest.Mbps(bytes, seconds), 8);
    [Fact] public async Task ExplicitStartCompletesBoundedTransfers()
    {
        var handler = new Handler();
        await using var test = new QuickSpeedTest(handler, TimeSpan.FromMilliseconds(180));
        Assert.Equal("idle", test.Snapshot().Status); Assert.Equal(0, handler.Requests);
        test.Start(); Assert.Throws<InvalidOperationException>(test.Start);
        var result = await Wait(test);
        Assert.Equal("complete", result.Status); Assert.True(result.DownloadMbps > 0); Assert.True(result.UploadMbps > 0);
        Assert.InRange(result.DownloadBytes, 1, 256_000_000); Assert.InRange(result.UploadBytes, 1, 128_000_000);
        Assert.Equal(QuickSpeedTest.Mbps(result.DownloadBytes, result.DownloadSeconds!.Value), result.DownloadMbps!.Value, 8);
        Assert.Equal(QuickSpeedTest.Mbps(result.UploadBytes, result.UploadSeconds!.Value), result.UploadMbps!.Value, 8);
        Assert.NotNull(result.IdleLatencyMs); Assert.Equal(0, handler.Active); Assert.InRange(handler.Peak, 1, 3);
    }
    [Fact] public async Task CancellationJoinsTransfersAndCanRestart()
    {
        var handler = new Handler("slow");
        await using var test = new QuickSpeedTest(handler);
        test.Start(); await Task.Delay(35); await test.CancelAsync();
        Assert.Equal("canceled", test.Snapshot().Status); Assert.Equal(0, handler.Active);
        Assert.Null(test.Snapshot().DownloadMbps); Assert.Null(test.Snapshot().UploadMbps);
        test.Start(); await Task.Delay(25); await test.CancelAsync();
        Assert.Equal(0, handler.Active);
    }
    [Fact] public async Task NetworkChangeFailsWithoutRetainingCapacityResults()
    {
        var handler = new Handler("slow");
        await using var test = new QuickSpeedTest(handler);
        test.Start(); await Task.Delay(25); await test.CancelAsync("Network changed");
        Assert.Equal("error", test.Snapshot().Status); Assert.Equal("Network changed", test.Snapshot().Error); Assert.Equal(0, handler.Active);
    }
    [Theory]
    [InlineData("slow")][InlineData("failed")][InlineData("redirect")][InlineData("truncated")]
    public async Task BadServersNeverBecomeSuccessfulZeroSpeed(string behavior)
    {
        var handler = new Handler(behavior);
        await using var test = new QuickSpeedTest(handler, TimeSpan.FromMilliseconds(100));
        test.Start(); var result = await Wait(test);
        Assert.Equal("error", result.Status); Assert.NotNull(result.Error);
        Assert.Null(result.DownloadMbps); Assert.Null(result.UploadMbps); Assert.Equal(0, handler.Active);
    }
    [Fact] public async Task DisposalAwaitsCancellation()
    {
        var handler = new Handler("slow"); var test = new QuickSpeedTest(handler);
        test.Start(); await Task.Delay(25); await test.DisposeAsync();
        Assert.Equal(0, handler.Active); Assert.Throws<ObjectDisposedException>(test.Start);
    }
    [Fact] public async Task OverallDeadlineIsAnErrorAndJoinsRequests()
    {
        var handler = new Handler("slow");
        await using var test = new QuickSpeedTest(handler, totalDuration: TimeSpan.FromMilliseconds(100));
        test.Start(); var result = await Wait(test);
        Assert.Equal("error", result.Status); Assert.Contains("deadline", result.Error);
        Assert.Null(result.DownloadMbps); Assert.Equal(0, handler.Active);
    }
    [Fact] public async Task UploadCancellationDiscardsIncompleteResults()
    {
        var handler = new Handler("slowUpload");
        await using var test = new QuickSpeedTest(handler, TimeSpan.FromMilliseconds(150));
        test.Start(); using var deadline = new CancellationTokenSource(3000);
        while (test.Snapshot().Phase != "Upload") await Task.Delay(5, deadline.Token);
        await test.CancelAsync();
        Assert.Equal("canceled", test.Snapshot().Status); Assert.Null(test.Snapshot().UploadMbps);
        Assert.Null(test.Snapshot().DownloadMbps); Assert.Equal(0, handler.Active);
    }
    [Theory][InlineData("startSpeedTest")][InlineData("cancelSpeedTest")]
    public void SpeedCommandsAreStrictAndCannotSupplyRemoteUrls(string type)
    {
        Assert.Equal(type, BridgeCommand.Parse($$"""{"version":2,"id":"a","type":"{{type}}"}""").Type);
        Assert.Throws<ArgumentException>(() => BridgeCommand.Parse($$"""{"version":2,"id":"a","type":"{{type}}","url":"https://example.com"}"""));
    }
}
