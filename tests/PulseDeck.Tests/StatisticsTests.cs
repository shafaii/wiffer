using PulseDeck.Core;
using Xunit;

namespace PulseDeck.Tests;

public class StatisticsTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-18T10:00:00Z");
    private static Sample S(int age, double? value, ProbeStatus status = ProbeStatus.Success) => new(Now.AddSeconds(-age), "1.1.1.1", value, status, null);
    [Fact] public void ComputesMedianNearestRankAndSuccessiveSuccessfulVariation()
    {
        var stats = Statistics.Calculate([S(5, 5), S(4, 10), S(3, null, ProbeStatus.Timeout), S(2, 100), S(1, 20), S(0, null, ProbeStatus.Error)], Now, TimeSpan.FromMinutes(1));
        Assert.Equal(6, stats.Sent); Assert.Equal(4, stats.Successful); Assert.Equal(1, stats.Timeouts); Assert.Equal(1, stats.Errors);
        Assert.Equal(5, stats.Min); Assert.Equal(33.75, stats.Average); Assert.Equal(100, stats.Max); Assert.Equal(15, stats.Median); Assert.Equal(100, stats.P95);
        Assert.Equal(175d / 3, stats.Variation!.Value, 8); Assert.Equal(100d / 3, stats.LossPercent!.Value, 8);
    }
    [Fact] public void WindowIsLeftExclusiveRightInclusiveAndRejectsFutureSamples()
    {
        var stats = Statistics.Calculate([S(61, 100), S(60, 100), S(59, 20), S(0, 10), S(-1, 100)], Now, TimeSpan.FromSeconds(60));
        Assert.Equal(2, stats.Sent); Assert.Equal(15, stats.Average);
    }
    [Fact] public void NoSamplesOrAllFailuresNeverBecomeZeroRtt()
    {
        var empty = Statistics.Calculate([], Now, TimeSpan.FromMinutes(1));
        Assert.Null(empty.Min); Assert.Null(empty.Average); Assert.Null(empty.Median); Assert.Null(empty.P95); Assert.Null(empty.Variation); Assert.Null(empty.LossPercent);
        var failed = Statistics.Calculate([S(0, null, ProbeStatus.Timeout)], Now, TimeSpan.FromMinutes(1));
        Assert.Equal(100, failed.LossPercent); Assert.Null(failed.Average);
    }
    [Fact] public void ActualZeroMillisecondReplyIsValidAndSingleSampleHasNoVariation()
    {
        var stats = Statistics.Calculate([S(0, 0)], Now, TimeSpan.FromMinutes(1));
        Assert.Equal(0, stats.Min); Assert.Equal(0, stats.LossPercent); Assert.Null(stats.Variation);
    }
    [Fact] public void P95IsNearestRankNotMaximumForTwentySamples()
    {
        var stats = Statistics.Calculate(Enumerable.Range(1, 20).Select(n => S(21 - n, n)), Now, TimeSpan.FromMinutes(1));
        Assert.Equal(19, stats.P95); Assert.Equal(10.5, stats.Median);
    }
}
