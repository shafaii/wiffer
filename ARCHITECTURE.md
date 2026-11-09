# Wiffer architecture

M0.8 extends the verified M0.7 WPF + WebView2 + React application with a read-only Wi-Fi Lab. The native ICMP lifecycle remains in place. There is no packet inspection, recording database, automatic speed test, cloud account, or M1 implementation.

## Native providers and selection

`src/PulseDeck.Core` owns all measurements. `NativeProbe` uses cancellation-aware `Ping.SendPingAsync`. `WindowsNetworkProvider` implements `INetworkProvider` and `ITrafficProvider`; it moved out of the WPF project so native telemetry stays together. Its Windows-only boundary is marked with `SupportedOSPlatform`.

Adapter detection enumerates operational interfaces with IPv4 addresses and gateways. `GetIfEntry2` validates the MIB_IF_ROW2 hardware-interface flag and excludes filter interfaces. `GetBestInterface` selects the physical candidate on the Windows route to 1.1.1.1. If that route is virtual/VPN, the first physical gateway candidate by index is used with an explicit fallback explanation. No physical candidate means local traffic is unavailable. This is not route binding: ICMP still follows Windows routing, and automatic selection does not establish Internet reachability. Multiple physical interfaces, VPNs, or a different configured target can make the chosen interface an imperfect representation of that route; this is disclosed in the inspector.

Every traffic read re-identifies the selected adapter, validates the returned GUID and physical/non-filter flags, and checks its operational state using GUID → LUID resolution and `GetIfEntry2`. Bytes received/sent are sampled around 4 Hz. Cumulative bytes, errors and discards are also exposed in the approximately 1 Hz connection inspector refresh. Cumulative 64-bit counters cross the JavaScript bridge as decimal strings to avoid loss of integer precision. Errors/discards are interface/driver totals, not ICMP loss or verified Wi-Fi retry counts.

## Throughput semantics

`TrafficCalculator` computes both directions independently:

```text
Mbps = (currentBytes - previousBytes) * 8 / (monotonicElapsedSeconds * 1,000,000)
```

Integer subtraction occurs before floating-point conversion. The displayed unit is decimal megabits per second, not MB/s. All selected-interface traffic is counted, including LAN transfers, protocol overhead and other applications. The value is not Internet bandwidth capacity and is unrelated to negotiated Wi-Fi rate.

Each sample includes a strictly increasing sequence number, UTC completion timestamp, measured monotonic interval, status, raw instantaneous speeds, short averages, and optional explanation. Wall-clock adjustment does not change speed mathematics. A new/replaced adapter, pause/resume, negative/reset/wrapped counters, nonpositive interval, or interval over two seconds produces a null `baseline` sample. Read failures produce null `unavailable` samples and discard the baseline. Recovery requires a new baseline. Idle valid counters produce genuine zero. Positive speeds are not arbitrarily clamped.

The approximately 3-second average weights each observed rate by its measured interval. It retains whole intervals until dropping the oldest would leave less than three seconds, with an additional hard bound of 64 intervals. The readouts format the latest native rates and weighted averages to two decimal places. Missing values appear as dashes and valid zero appears as 0.00. The status pill and last sample time identify retained values when monitoring is inactive.

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

The cockpit has paired SVG download and upload gauges in a Local PC traffic card, a separate Path response card, six shared-grid instruments, and expandable connection/statistics sections. Both gauges share six tick values from 0 to 100 Mbps at the base scale. The scale increases by powers of ten to fit the highest measured rate from either direction in the last 30 seconds of native sample time. Gauge angle and arc fill are linear between adjacent printed ticks. Motion applies to the SVG indicators only. Imported records are the six original summaries on a separate non-live page. Fonts are Windows system fonts and assets are local.

The six instruments are gateway RTT, external RTT, 10-second rolling RTT variation, packet-loss event lanes, download history and upload history. All share the selected 60/300-second time domain and linked ECharts hover inspection. Failure diamonds have no RTT. Packet-loss lanes show dim successful-reply ticks and coral failures, with combined rolling loss and completed-probe count. Throughput plots are unsmoothed. A selected chart expands in place, retaining its ECharts instance; Escape collapses it.

RTT focus mapping remains continuous and invertible:

```text
f(r) = 2r                         for 0 <= r <= 30
f(r) = 60 + 20 log2(r / 30)       for r > 30
```

Axes label the inverse mapping; hover displays raw precision. The ordinary 0–30 ms band is retained with adaptive headroom. A linear option is available. Probe gaps above 1.8 seconds and throughput gaps above one second explicitly break traces. Failed probe values remain null. Chart variation uses a rolling 10-second successful-reply window; this is deliberately distinguished from the selected-window summary variation.

The host sends probe/connection snapshots around 1 Hz and new traffic samples on acquisition completion at approximately 4 Hz. A single pending dispatcher callback coalesces traffic notifications and the 250 ms timer provides fallback delivery. A bounded external React store deduplicates sequences and resets on generation changes. The traffic card subscribes at traffic frequency in Instruments. The main cockpit and chart histories update on the snapshot. Six canvas instances are initialized once, updated using stable series IDs, resized by ResizeObserver, and disposed on unmount. Normal GPU/compositor rendering uses WebView2 defaults. The on-demand 30-second frame check measures rAF intervals and estimates missed refresh opportunities relative to the observed median. GPU presentation is outside the scope of those measurements.

## Versioned bridge and security

Both directions now use version 2. Commands are `ready`, `pause`, `resume`, `reset`, `configure`, `startSpeedTest` and `cancelSpeedTest`. The speed-test commands accept no configuration or URL. C# rejects oversized (>4096 characters), deeply nested, extra/duplicate-field, unknown-version, invalid-address and out-of-range commands. One command occupies the command slot at a time. Responses are `snapshot`, `traffic`, `speedTest`, `ack` or `error`. The traffic envelope adds an increasing batch ID, host UTC send time, monotonic newest-sample age and provider-read duration. Speed-test states are bounded and validated, including null final results for canceled/failed runs. Traffic batches contain a generation and at most 1204 ordered samples. Zod validates exact schemas, nonnegative finite speeds, valid timestamps/intervals, bounded signal fields, and null metrics for unavailable/baseline states. Old/duplicate sequences are ignored; old generations cannot resurrect cleared data. UI commands await acknowledgments; the heartbeat watchdog marks host data stale after five seconds.

The WPF host still maps only packaged `wwwroot` to `https://wiffer.local`. Source scheme/host/default port/credentials are checked. External requests, external navigation, frames, downloads, new windows and permissions are denied. Host objects, developer tools, browser accelerators, autofill and password saving stay disabled. CSP prevents remote code/assets/connections/forms/frames. Native startup/renderer failures are visible and stop measurement; shutdown awaits cancellation before disposing WebView2. The manifest remains asInvoker and PerMonitorV2. Only the ordinary per-user WebView2 runtime profile persists; measurement history is memory-only.

## Verification tooling

`--window-size=WIDTHxHEIGHT` provides a bounded physical-pixel initial outer-window size for local verification (Windows non-client borders reduce the content viewport). `scripts/verify-webview.cjs` is an opt-in development harness requiring Playwright and a temporary localhost WebView2 debugging port. It uses the actual packaged page/native bridge, never injected telemetry. It verifies lifecycle controls, original imported summaries, target validation, chart identity across resizing/expansion, exact WebView viewport captures, and rAF intervals. `WIFFER_PLAYWRIGHT` can point to an existing Playwright installation; `WIFFER_CDP` defaults to localhost:9223. No debug port is configured in the app or normal launch.

See HANDOFF.md for actual observations, evidence, limitations and exact build commands.

The traffic gauges were checked against native batch values and timestamps in WebView2 at 1366×768 and 1920×1080. All six history charts fit at both sizes. At 850×650 the cards stack. See HANDOFF.md for the lifecycle checks and validation scope.

## API references

- https://learn.microsoft.com/en-us/windows/win32/api/netioapi/ns-netioapi-mib_if_row2
- https://learn.microsoft.com/en-us/dotnet/api/system.net.networkinformation.networkinterface.getipstatistics
- https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ne-wlanapi-wlan_intf_opcode
- https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_realtime_connection_quality
- https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_realtime_connection_quality_link_info
- https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_connection_attributes
- https://learn.microsoft.com/en-us/windows/win32/nativewifi/wi-fi-access-location-changes

## M0.7 presentation and packaging

The M0.7 release introduced the local SVG detective mark, multi-resolution ICO, sky/glacier signal accents, a midnight graphite chassis and angular layered SVG gauges. Spring motion in that release affected display only. Installed Windows UI and monospace fonts are used without redistribution. The executable/product is Wiffer. Internal solution and Core project names use PulseDeck. The local profile uses the Wiffer application-data directory.

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

Chart updates remain at the snapshot rate with stable ECharts instances and series IDs. The full traffic history for those charts is memoized per snapshot. The traffic card derives its shared scale from the same bounded store as batches arrive. Speed-test progress subscribes separately. WebView2 hardware acceleration uses its default settings.

`scripts/benchmarks` measures real providers at increasing bounded rates, includes 20 comparisons of direct counters bracketed by managed API reads, and keeps public ICMP at 1 Hz. `scripts/benchmark-webview.cjs` records 30-second native/bridge/rAF observations at both viewports. `scripts/verify-speedtest.cjs` explicitly consumes test traffic to verify cancellation, completion and byte limits. `scripts/verify-diagnostics.cjs` checks the inspector and captures diagnostics without publishing identifiers. See HANDOFF.md for measured results and limitations.


## M0.8 Wi-Fi Lab data and rendering

`MonitorEngine` serializes the approximately one-second connection poll under its lifecycle gate, timestamps completion in `NetworkState.ObservedAt`, and skips polling while paused. Resume revalidates the selected route before restarting probes; a changed adapter clears prior route history. The existing 1 Hz bridge-v2 snapshot carries one current observation; independent 4 Hz traffic batches, 1204 traffic samples, 600 probe samples, probe cancellation and fixed speed-test endpoints are unchanged. This adds no full-history payload or native overlapping query. Snapshot and acquisition timers are independent: a snapshot can repeat an observation or skip one when their phases cross. The UI deduplicates timestamps rather than inventing the missing poll; this is observed history, not a guarantee that every native acquisition reaches the renderer.

`NativeWifi` brackets radio readings with interface-state queries (opcode 6) and association identity queries (opcode 7). A known nonconnected state returns null measurements. Detected BSSID changes or an ending nonconnected state discard the mixed observation. The previously selected physical Wi-Fi interface may supply reconnect status while awaiting an IPv4 route; it is not reused as a traffic route. Selecting Ethernet clears that retained identity. Privacy restrictions remain independent of radio quality availability. Bracketing cannot prove atomicity: very short changes between queries, privacy-hidden BSSIDs and multiple links cannot be fully resolved. Native queries are synchronous OS calls; shutdown waits for them and cannot impose a hard cancellation deadline on a stalled driver.

The existing bounded 604-byte connection parser additionally exposes the six-byte BSSID, PHY type, authentication, cipher and connection mode. Unknown enums retain an explicit numeric label. The adapter MAC comes from `NetworkInterface.GetPhysicalAddress`; it is the reported interface address, not a claim about a permanent hardware identity. Real-time quality/RSSI/rates and frequency-derived band/channel keep M0.7 parsing semantics. No scans, location-policy changes, elevation or radio-setting APIs are added. Relevant layouts and enum values were checked against Microsoft's [association attributes](https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_association_attributes), [security attributes](https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_security_attributes), [authentication enum](https://learn.microsoft.com/en-us/windows/win32/nativewifi/dot11-auth-algorithm) and [cipher enum](https://learn.microsoft.com/en-us/windows/win32/nativewifi/dot11-cipher-algorithm).

`WifiHistory` accepts validated native snapshots even when another tab is selected, stores at most 600 observations, and clears on session/known adapter replacement. Pause adds no points. Missing fields remain null, observed gaps above 2.2 seconds and detected BSSID changes break traces. Four stable ECharts instances share 60/300-second windows and linked hover: RSSI, quality, negotiated RX/TX and gateway ICMP. Charts update only with snapshots, use exact values and never smooth samples. Gateway replies retain their own completion times and routing; proximity on the timeline is not a causal diagnosis. Switching tabs disposes the view's charts but retains bounded observations.

`WifiLab` computes one state and retains the native completion timestamp for its single Wi-Fi hero. Older than 3.5 seconds is stale (with a one-second UI freshness tick); pause and host staleness suppress live graphics. Reconnecting requires a reported discovering/associating/authenticating state, not an invented reconnect timer. Degraded means RSSI below −75 dBm or quality below 40%; weakening means a drop of at least 4 dB over 2–4.5 seconds without a known gap/roam. Stable means neither display threshold is active; none is a connection-quality guarantee or causal diagnosis.

M0.8.1 replaces the radar and connection bridge entirely with one layered SVG Wi-Fi symbol. Centered inner-to-outer arc coverage maps measured RSSI from −100 to −40 dBm, clipped only for display. Reported quality independently controls a fine light layer. Missing fields immediately suppress their respective layers. The anchor indicates a current usable observation, not traffic activity. Known band subtly adjusts saturation/brightness; unavailable band is neutral. No distance, particles, sweep, periodic pulse or synthetic traffic is shown.

The existing exact critically damped spring interpolates RSSI coverage and quality lighting in one display-only rAF loop. It preserves velocity, stops on convergence/hidden documents, and immediately applies live reduced-motion changes. Exact numbers, native timestamps and histories never interpolate. Disconnected is slashed, reconnecting/awaiting route has an incomplete static ring, stale has a faint silhouette and dotted ring, unavailable has an outlined anchor, and paused has pause bars. Inactive states hide current numerical readings; last observations remain accessible in history/inspector. Warning colour follows existing degraded/weakening thresholds without claiming a cause.

The hero has one short state and two exact readings. Four subordinate charts retain stable ECharts instances and original history semantics. Technical details and explanations live in a collapsed 17-field inspector. Static metal gradients and shallow SVG depth use no new runtime dependency. M0.7 cockpit, monitoring, Quick Speed Test, bridge and native providers are unchanged.

`scripts/verify-wifi-lab.cjs` uses the real local native bridge for two viewport captures, exact-number/timestamp comparisons, chart identity checks, pause/resume, reduced motion and 30-second frame-callback/cadence observations. It never injects telemetry. See HANDOFF.md for measured results; all frame timings describe rAF opportunities, not GPU present events.

## M0.8.1 validation boundary

Required native/frontend tests and builds pass (70 native, 22 frontend). `scripts/verify-wifi-states.cjs` bundles a separate, explicitly labeled fixture application into ignored artifacts, serves it only on localhost, and checks inactive states, independent missing fields, spring convergence and live reduced motion in headless Edge. It is never imported by production and never injects measurements into the native bridge. Real WebView2 captures and frame opportunities are separate evidence; see HANDOFF.md. Physical disconnect/roaming, MLO, high-DPI and second-PC execution remain unvalidated. No GPU-present or sustained FPS claim is made.

## M0.8.2 hero replacement (supersedes M0.8.1 symbol mapping)

`WirelessHalo` replaces the generic Wi-Fi symbol, retaining the existing view, measurements, spring clock and chart instances. `haloModel.ts` defines clamped quality/100 calibration (null for missing/nonfinite values) and quality categories at 40/60/80%. Connection/freshness states take precedence. A `pathLength=100` circle displays quality clockwise from the top; orb lighting and restrained orbital tilt use the same display-only spring. RSSI is not a halo input or inferred distance. Layered SVG gradients/occlusion provide depth without a 3D dependency. Missing quality suppresses live fill/light; inactive states show distinct static glyphs/tracks. Inspector fields and charts remain unchanged; only its description reflects the new mapping.

26 frontend and 70 native tests, TypeScript, production and Release builds pass. Real native WebView2 checks verify both viewports and calibrated stroke values; isolated browser fixtures verify failure states, spring convergence and live reduced motion. Short capture windows do not establish GPU presentation or sustained performance. See HANDOFF.md for screenshots, executable path and remaining hardware limitations.

## Focused glass-tile redesign
The latest user-authorized hero replaces orb/arcs/bars with one glass tile. Quality controls fill height via the existing spring; exact numbers do not interpolate. Native data and charts are unchanged. 26 frontend/70 native tests and required builds pass; actual two-viewport and reduced-motion checks pass. See HANDOFF.md for evidence and hardware limitations. No later milestone, push or release.

## Signal Field — latest focused hero
The user-directed Signal Field supersedes previous hero artwork: wide glass surface, flowing contours, quality expansion/illumination and independent RSSI compression. Pointer deformation is cosmetic, spring-driven and reduced-motion aware. Native measurements/charts remain unchanged. 26 frontend and 70 native tests, builds and two-viewport native checks pass, including drag/release and reduced motion. See HANDOFF.md for evidence and touchscreen/hardware limits. No release or later milestone.

## M0.8.3 — Live Signal Surface

Supersedes the decorative Signal Field and earlier hero rules. A full-width SVG timeline uses native observation timestamps and fixed 0–100% quality coordinates. Layered strokes illuminate the same trace; flat data stays flat. Missing quality, nonconnected observations, gaps and roaming split paths. Original native timestamp strings retain precision for inspection; RSSI remains independent. Hover, horizontal pan, bounded 60–300-second wheel/pinch zoom, pinning, Return to Live and keyboard inspection share the four historical charts' time window. Gateway replies keep their own timestamps. Spring motion translates presentation/cursor only, stops at rest/hidden and honors reduced motion.

MonitorEngine raises NetworkObserved after committing a serialized refresh and releasing its lifecycle gate. The host coalesces notifications on its dispatcher and sends the existing bridge-v2 snapshot. The 250 ms timer sends a fallback snapshot after at least 1250 ms without delivery. Polling frequency, synchronous native-query behavior, UTC completion time, monotonic elapsed timing, traffic batches and history capacities are unchanged. No overlapping reads or new bridge message type.

Observed validation: 35 frontend and 71 native tests pass, plus TypeScript, production and Release builds. Native checks cover both viewports, exact readings/timestamps, hover/pan/zoom/pin/Live, keyboard controls, pause/resume, four stable charts and reduced motion. Isolated fixtures cover states/missing fields and emulated pinch; these are not hardware tests. See HANDOFF.md for screenshots, measured delivery/frame timing and remaining limitations. User explicitly authorized committing/pushing M0.8.3 on 2026-10-23; no release, installation replacement, band switching or M1. Stop after M0.8.3.

## M0.8.4 hero presentation

`KineticFabric.tsx` replaces only the main Wi-Fi Lab hero. The four historical ECharts instances, their linked tooltips and 60/300-second controls remain. Previous hero timeline navigation is intentionally replaced with local fabric manipulation. Native collectors, bridge v2, acquisition-triggered snapshots and traffic histories are unchanged.

`fabricModel.ts` maps quality linearly to a display factor, builds deterministic asymmetric ribbon surfaces, and gates local RX/TX presentation on measured samples no older than 1200 ms. A bounded log1p(Mbps)/log(101) mapping sets seam speed and opacity; it is neither internet capacity nor a signal-strength estimate. Pale RX flows left and muted blue TX right. No RTT deformation or ambient motion. RSSI remains a separate exact reading. Inactive readings are suppressed, and missing quality does not suppress independently available RSSI.

One requestAnimationFrame loop uses the existing critically damped spring for quality and local displacement. Geometry is cached across traffic-only frames. Pointer capture supports mouse/touch pulls; release, cancel, blur and visibility reset displacement. Arrow keys provide a keyboard pull. Reduced motion snaps to quality, uses quarter-size direct interaction and holds traffic seam phases static. Hidden pages cancel rendering. No React state updates per animation frame and no new dependency.

M0.8.4 validation: 39 frontend / 71 native tests and required checks/builds pass; actual two-viewport WebView2 captures, pointer drag/recovery, reduced motion, native values/timestamps and traffic motion pass. Isolated quality/state/traffic/touch fixtures supplement native checks. No GPU presentation, sustained frame-rate, CPU/battery or physical touchscreen claim is established.
