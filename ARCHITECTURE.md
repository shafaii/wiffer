# Wiffer M0.7 architecture

M0.7 extends the verified WPF + WebView2 + React application. The native ICMP lifecycle remains in place. There is no packet inspection, recording database, automatic speed test, cloud account, or M1 implementation.

## Native providers and selection

`src/PulseDeck.Core` owns all measurements. `NativeProbe` uses cancellation-aware `Ping.SendPingAsync`. `WindowsNetworkProvider` implements `INetworkProvider` and `ITrafficProvider`; it moved out of the WPF project so native telemetry stays together. Its Windows-only boundary is marked with `SupportedOSPlatform`.

Adapter detection enumerates operational interfaces with IPv4 addresses and gateways. `GetIfEntry2` validates the MIB_IF_ROW2 hardware-interface flag and excludes filter interfaces. `GetBestInterface` selects the physical candidate on the Windows route to 1.1.1.1. If that route is virtual/VPN, the first physical gateway candidate by index is used with an explicit fallback explanation. No physical candidate means local traffic is unavailable. This is not route binding: ICMP still follows Windows routing, and automatic selection does not establish Internet reachability. Multiple physical interfaces, VPNs, or a different configured target can make the chosen interface an imperfect representation of that route; this is disclosed in the inspector.

Every traffic read re-identifies the selected adapter, validates the returned GUID and physical/non-filter flags, and checks its operational state using GUID → LUID resolution and `GetIfEntry2`. Bytes received/sent are sampled around 4 Hz. Cumulative bytes, errors and discards are also exposed in the 3-second connection inspector refresh. Cumulative 64-bit counters cross the JavaScript bridge as decimal strings to avoid loss of integer precision. Errors/discards are interface/driver totals, not ICMP loss or verified Wi-Fi retry counts.

## Throughput semantics

`TrafficCalculator` computes both directions independently:

```text
Mbps = (currentBytes - previousBytes) * 8 / (monotonicElapsedSeconds * 1,000,000)
```

Integer subtraction occurs before floating-point conversion. The displayed unit is decimal megabits per second, not MB/s. All selected-interface traffic is counted, including LAN transfers, protocol overhead and other applications. The value is not Internet bandwidth capacity and is unrelated to negotiated Wi-Fi rate.

Each sample includes a strictly increasing sequence number, UTC completion timestamp, measured monotonic interval, status, raw instantaneous speeds, short averages, and optional explanation. Wall-clock adjustment does not change speed mathematics. A new/replaced adapter, pause/resume, negative/reset/wrapped counters, nonpositive interval, or interval over two seconds produces a null `baseline` sample. Read failures produce null `unavailable` samples and discard the baseline. Recovery requires a new baseline. Idle valid counters produce genuine zero. Positive speeds are not arbitrarily clamped.

The approximately 3-second average weights each observed rate by its measured interval. It retains whole intervals until dropping the oldest would leave less than three seconds, with an additional hard bound of 64 intervals. Instantaneous numbers are never smoothed. Digital illuminated arcs use an exact critically damped spring (angular frequency 19/s) integrated at requestAnimationFrame cadence, carrying velocity between samples and honoring reduced-motion preferences. Static SVG layers provide extruded depth, precision edge lighting and glass reflection. Only arc position/trail is animated; numbers are exact, missing values remain dashes, and no synthetic measurement enters history. Automatic ranges start at 100 Mbps, grow by powers of ten when exceeded, and never shrink during the mounted instrument view. Fixed 10/100/1000/10000 Mbps ranges are available; an above-scale numeric value remains uncapped.

`TrafficMonitor` owns a bounded 1204-sample queue (approximately five minutes at 4 Hz), a generation number for clear/reset, and delta-batch reads by sequence. The traffic worker joins the existing engine's worker set, so pause, reset, route changes, settings and shutdown cancel and await it alongside the probe workers. Reconnection to the same route preserves a visible history gap; route/adapter replacement clears histories. Native sampling runs in background tasks independently of rendering.

## Wi-Fi details

`NativeWifi` opens a Native Wi-Fi handle, queries only the selected interface, frees every returned allocation, and closes the handle. No scans or administrative privileges are requested.

- `wlan_intf_opcode_realtime_connection_quality` (19) provides signal quality, RX/TX association rates and per-link frequency/RSSI on supported Windows/driver combinations.
- `wlan_intf_opcode_current_connection` (7), parsed as `WLAN_CONNECTION_ATTRIBUTES`, provides the SSID and fallback quality/link rates. Windows location privacy can deny this query; the UI explains access denial rather than substituting another SSID.
- RSSI and channel opcodes are queried only as fallback. A channel alone never determines the band. RSSI is never inferred from quality. Association rates are kbit/s and converted to Mbps by dividing by 1000.
- The real-time frequency determines 2.4/5/6 GHz band and supported channel mapping. Multiple links are not collapsed into a fictitious single band/channel/RSSI; those fields stay unavailable with an explanation. Association-level rates/quality can remain available.

`WifiParser` bounds all structures before reading fields: connection attributes require 604 bytes, real-time data requires a 24-byte header plus 272 bytes per link, link count is limited to 16, quality to 0–100, SSID to 32 bytes, and RSSI to -127 through -1 dBm. Query allocations above 16 KiB are rejected. Invalid UTF-8 SSIDs display as explicit hex; control characters are replaced. Missing/invalid fields are null with explanation. Advanced Wi-Fi retry/frame-failure diagnostics are deferred because meaningful driver support was not established.

## Preserved ICMP lifecycle and statistics

One independently awaited probe loop per endpoint, with no overlap or catch-up queue. Native timeout plus a runtime-owned cancellation deadline bounds a probe. Pause/settings/reset/network transitions await cancellation. Canceled probes never become loss. The runtime owns deadline-timer disposal synchronization, preserving the M0 regression fix for queued callbacks.

Probe histories remain bounded to 600 samples per endpoint. Completion timestamps are UTC. Successful native 0 ms replies are valid. Timeout/error RTT is null. The rolling window is `(now - window, now]` for 60 or 300 seconds. Pause freezes the measurement time and statistics. Running time uses monotonic active monitoring time.

Sent means completed measurements. Loss is `(timeouts + errors) / sent * 100`; failures are retained separately. Detected disconnections, cancellations and unmeasured intervals are excluded. Min/mean/max/median/P95 use successes only; P95 uses nearest rank. Summary RTT variation is the arithmetic mean of absolute differences between successive successful RTTs within the selected window. Fewer than two successes means null. No measurements means null loss.

## Presentation and data flow

The cockpit has two measured digital traffic instruments, a distinct path-response readout, six shared-grid instruments, and expandable connection/statistics sections. Imported records remain the original six summaries on a separate non-live page, without invented dates or reconstructed samples. Fonts are Windows system fonts; assets are local.

The six instruments are gateway RTT, external RTT, 10-second rolling RTT variation, packet-loss event lanes, download history and upload history. All share the selected 60/300-second time domain and linked ECharts hover inspection. Failure diamonds have no RTT. Packet-loss lanes show dim successful-reply ticks and coral failures, with combined rolling loss and completed-probe count. Throughput plots are unsmoothed. A selected chart expands in place, retaining its ECharts instance; Escape collapses it.

RTT focus mapping remains continuous and invertible:

```text
f(r) = 2r                         for 0 <= r <= 30
f(r) = 60 + 20 log2(r / 30)       for r > 30
```

Axes label the inverse mapping; hover displays raw precision. The ordinary 0–30 ms band is retained with adaptive headroom. A linear option is available. Probe gaps above 1.8 seconds and throughput gaps above one second explicitly break traces. Failed probe values remain null. Chart variation uses a rolling 10-second successful-reply window; this is deliberately distinguished from the selected-window summary variation.

The host sends a probe/connection snapshot at 1 Hz and new traffic samples on acquisition completion at approximately 4 Hz. A single pending dispatcher callback coalesces notifications; the 250 ms timer remains a fallback, not the primary delivery gate. A bounded external React store deduplicates sequences and resets on generation changes. Only the digital-instrument subtree subscribes at traffic frequency; the main cockpit and chart histories update on the 1 Hz snapshot. Six canvas instances are initialized once, updated using stable series IDs, resized by ResizeObserver, and disposed on unmount. There is no continuous chart animation or sample smoothing. Normal GPU/compositor rendering is enabled by WebView2 defaults; no software-rendering flag is added. The on-demand 30-second frame check measures rAF intervals and estimates missed refresh opportunities relative to the observed median. It does not measure GPU presentation or establish a sustained FPS guarantee.

## Versioned bridge and security

Both directions now use version 2. Commands are `ready`, `pause`, `resume`, `reset`, `configure`, `startSpeedTest` and `cancelSpeedTest`. The speed-test commands accept no configuration or URL. C# rejects oversized (>4096 characters), deeply nested, extra/duplicate-field, unknown-version, invalid-address and out-of-range commands. One command occupies the command slot at a time. Responses are `snapshot`, `traffic`, `speedTest`, `ack` or `error`. The traffic envelope adds an increasing batch ID, host UTC send time, monotonic newest-sample age and provider-read duration. Speed-test states are bounded and validated, including null final results for canceled/failed runs. Traffic batches contain a generation and at most 1204 ordered samples. Zod validates exact schemas, nonnegative finite speeds, valid timestamps/intervals, bounded signal fields, and null metrics for unavailable/baseline states. Old/duplicate sequences are ignored; old generations cannot resurrect cleared data. UI commands await acknowledgments; the heartbeat watchdog marks host data stale after five seconds.

The WPF host still maps only packaged `wwwroot` to `https://wiffer.local`. Source scheme/host/default port/credentials are checked. External requests, external navigation, frames, downloads, new windows and permissions are denied. Host objects, developer tools, browser accelerators, autofill and password saving stay disabled. CSP prevents remote code/assets/connections/forms/frames. Native startup/renderer failures are visible and stop measurement; shutdown awaits cancellation before disposing WebView2. The manifest remains asInvoker and PerMonitorV2. Only the ordinary per-user WebView2 runtime profile persists; measurement history is memory-only.

## Verification tooling

`--window-size=WIDTHxHEIGHT` provides a bounded physical-pixel initial outer-window size for local verification (Windows non-client borders reduce the content viewport). `scripts/verify-webview.cjs` is an opt-in development harness requiring Playwright and a temporary localhost WebView2 debugging port. It uses the actual packaged page/native bridge, never injected telemetry. It verifies lifecycle controls, original imported summaries, target validation, chart identity across resizing/expansion, exact WebView viewport captures, and rAF intervals. `WIFFER_PLAYWRIGHT` can point to an existing Playwright installation; `WIFFER_CDP` defaults to localhost:9223. No debug port is configured in the app or normal launch.

See HANDOFF.md for actual observations, evidence, limitations and exact build commands.

## API references

- https://learn.microsoft.com/en-us/windows/win32/api/netioapi/ns-netioapi-mib_if_row2
- https://learn.microsoft.com/en-us/dotnet/api/system.net.networkinformation.networkinterface.getipstatistics
- https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ne-wlanapi-wlan_intf_opcode
- https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_realtime_connection_quality
- https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_realtime_connection_quality_link_info
- https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_connection_attributes
- https://learn.microsoft.com/en-us/windows/win32/nativewifi/wi-fi-access-location-changes

## M0.7 presentation and packaging

Wiffer adds an original local SVG detective mark, multi-resolution ICO, sky/glacier signal accents, a midnight graphite chassis and angular layered SVG digital instruments. Spring motion remains display-only; all numbers and histories retain M0.5 semantics. Installed Windows UI and monospace fonts are used without redistribution. The executable/product is Wiffer; internal PulseDeck solution and Core project names remain to avoid unrelated refactoring. The local profile uses the Wiffer application-data directory.

Public captures mask identifiers without modifying measurements. Old local evidence and earlier history are excluded from the public root commit. A self-contained x64 ZIP contains runtime files, frontend assets and licenses; WebView2 Evergreen remains a separate prerequisite. The per-user shortcut targets a stable installation directory and remains valid when copied.

## Explicit internet speed test

`QuickSpeedTest` lives in Core and uses `HttpClient` with redirects, cookies and decompression disabled, bounded connections and a five-second connect timeout. It contacts only the documented `https://speed.cloudflare.com/__down?bytes=N` and `https://speed.cloudflare.com/__up` endpoints. No Cloudflare SDK or logging endpoint is used. The browser's local-origin restrictions and CSP remain unchanged.

The user sees the traffic/latency warning before selecting Start test. The test first warms TLS/DNS and measures three HTTP response-header round trips (two-second deadlines). Then two sequential phases use two concurrent streams, up to ten seconds each, with a 35-second overall deadline. Payload bounds are 256,000,000 download bytes and 128,000,000 upload bytes, plus protocol overhead. Downloads use 4 MB requests and uploads use random 1 MB bodies; partial received download bytes count, but at least one complete download request is required. Upload bytes count only after a successful HTTP response. Compressed, oversized, truncated, non-success and redirected download responses fail. Fast connections can hit byte limits before the time limit.

Native Stopwatch durations and transferred payload bytes determine results: bytes × 8 / seconds / 1,000,000. Per-direction durations/bytes remain visible, so a final sustained mean can be audited. Live values use actual byte deltas over observed approximately 250 ms intervals; confirmed uploads can be bursty. Results include request overhead and are conservative bounded HTTP throughput estimates, not a guaranteed maximum line rate or a replacement for a longer multistream capacity test. Two streams may not fully saturate every connection.

During transfers, sequential zero-byte HTTP requests measure loaded latency approximately once per second. Latency is the median response-header round trip, includes server time, and is separate from ICMP. Failures remain null. The edge code comes from the response's Cloudflare header, not invented geography. The app shows that Cloudflare receives the IP/test requests; it never posts a results report.

A single owned task prevents overlapping tests. Cancel, network-address changes, monitoring pause/reset/settings, renderer failure and shutdown cancel and await every transfer/latency task before disposing resources. Canceled/failed tests have no final capacity result; a timeout is an error, not a successful zero. Tests are independent of the selected monitoring interface and follow Windows HTTP routing/proxy configuration. No PC-to-modem LAN capacity test is implemented.

Endpoint reference verified 2026-10-19: https://github.com/cloudflare/speedtest (documented download/upload APIs). Native counter structures: https://learn.microsoft.com/en-us/windows/win32/api/netioapi/ns-netioapi-mib_if_row2 and https://learn.microsoft.com/en-us/windows/win32/api/netioapi/nf-netioapi-convertinterfaceguidtoluid .

## Diagnostics and performance verification

The bounded diagnostics window retains at most 1204 observations per metric: native interval/read duration, sample completion → host send, host send → JS receipt (same-machine wall-clock estimate), JS receipt → next rAF, and batch/sample sequence gaps. Probe completion cadence is computed from actual recent timestamps and is affected by timeouts and pause gaps. Histories and raw UTC timestamps are unchanged; canceled pre-enqueue traffic reads do not consume sequence numbers.

Chart updates remain at the 1 Hz snapshot rate with stable ECharts instances and series IDs. The traffic history copy is memoized per snapshot, avoiding unnecessary copies on unrelated UI state updates. Digital animation and test progress subscribe independently, and no chart interpolates missing samples. WebView2 hardware acceleration remains at its default; there is no heavy 3D library or continuous idle animation loop.

`scripts/benchmarks` measures real providers at increasing bounded rates, includes 20 comparisons of direct counters bracketed by managed API reads, and keeps public ICMP at 1 Hz. `scripts/benchmark-webview.cjs` records 30-second native/bridge/rAF observations at both viewports. `scripts/verify-speedtest.cjs` explicitly consumes test traffic; it verifies cancellation, completion, byte limits and reduced-motion/scale UI behavior. `scripts/verify-diagnostics.cjs` checks the inspector and captures diagnostics without publishing identifiers. See HANDOFF.md for measured results and limitations.
