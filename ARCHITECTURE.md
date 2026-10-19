# Wiffer M0.6 architecture

M0.5 extends the original WPF + WebView2 + React application. The native ICMP lifecycle remains in place. There is no packet inspection, recording database, automatic speed test, cloud account, or M1 implementation.

## Native providers and selection

`src/PulseDeck.Core` owns all measurements. `NativeProbe` uses cancellation-aware `Ping.SendPingAsync`. `WindowsNetworkProvider` implements `INetworkProvider` and `ITrafficProvider`; it moved out of the WPF project so native telemetry stays together. Its Windows-only boundary is marked with `SupportedOSPlatform`.

Adapter detection enumerates operational interfaces with IPv4 addresses and gateways. `GetIfEntry2` validates the MIB_IF_ROW2 hardware-interface flag and excludes filter interfaces. `GetBestInterface` selects the physical candidate on the Windows route to 1.1.1.1. If that route is virtual/VPN, the first physical gateway candidate by index is used with an explicit fallback explanation. No physical candidate means local traffic is unavailable. This is not route binding: ICMP still follows Windows routing, and automatic selection does not establish Internet reachability. Multiple physical interfaces, VPNs, or a different configured target can make the chosen interface an imperfect representation of that route; this is disclosed in the inspector.

Every traffic read re-identifies the selected adapter and checks its operational state before calling `NetworkInterface.GetIPStatistics()`. Bytes received/sent are sampled around 4 Hz. Cumulative bytes, errors and discards are also exposed in the 3-second connection inspector refresh. Cumulative 64-bit counters cross the JavaScript bridge as decimal strings to avoid loss of integer precision. Errors/discards are interface/driver totals, not ICMP loss or verified Wi-Fi retry counts.

## Throughput semantics

`TrafficCalculator` computes both directions independently:

```text
Mbps = (currentBytes - previousBytes) * 8 / (monotonicElapsedSeconds * 1,000,000)
```

Integer subtraction occurs before floating-point conversion. The displayed unit is decimal megabits per second, not MB/s. All selected-interface traffic is counted, including LAN transfers, protocol overhead and other applications. The value is not Internet bandwidth capacity and is unrelated to negotiated Wi-Fi rate.

Each sample includes a strictly increasing sequence number, UTC completion timestamp, measured monotonic interval, status, raw instantaneous speeds, short averages, and optional explanation. Wall-clock adjustment does not change speed mathematics. A new/replaced adapter, pause/resume, negative/reset/wrapped counters, nonpositive interval, or interval over two seconds produces a null `baseline` sample. Read failures produce null `unavailable` samples and discard the baseline. Recovery requires a new baseline. Idle valid counters produce genuine zero. Positive speeds are not arbitrarily clamped.

The approximately 3-second average weights each observed rate by its measured interval. It retains whole intervals until dropping the oldest would leave less than three seconds, with an additional hard bound of 64 intervals. Instantaneous numbers are never smoothed. Gauge pointers/arcs use short requestAnimationFrame easing and honor reduced-motion preferences. Automatic ranges start at 100 Mbps, grow by powers of ten when exceeded, and never shrink during the mounted instrument view. Fixed 10/100/1000/10000 Mbps ranges are available; an above-scale numeric value remains uncapped.

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

The cockpit has two measured traffic dials, a distinct path-response readout, six shared-grid instruments, and expandable connection/statistics sections. Imported records remain the original six summaries on a separate non-live page, without invented dates or reconstructed samples. Fonts are Windows system fonts; assets are local.

The six instruments are gateway RTT, external RTT, 10-second rolling RTT variation, packet-loss event lanes, download history and upload history. All share the selected 60/300-second time domain and linked ECharts hover inspection. Failure diamonds have no RTT. Packet-loss lanes show dim successful-reply ticks and coral failures, with combined rolling loss and completed-probe count. Throughput plots are unsmoothed. A selected chart expands in place, retaining its ECharts instance; Escape collapses it.

RTT focus mapping remains continuous and invertible:

```text
f(r) = 2r                         for 0 <= r <= 30
f(r) = 60 + 20 log2(r / 30)       for r > 30
```

Axes label the inverse mapping; hover displays raw precision. The ordinary 0–30 ms band is retained with adaptive headroom. A linear option is available. Probe gaps above 1.8 seconds and throughput gaps above one second explicitly break traces. Failed probe values remain null. Chart variation uses a rolling 10-second successful-reply window; this is deliberately distinguished from the selected-window summary variation.

The host sends a probe/connection snapshot at 1 Hz and only new traffic samples at up to 4 Hz. A bounded external React store deduplicates sequences and resets on generation changes. Only the dial subtree subscribes at traffic frequency; the main cockpit and chart histories update on the 1 Hz snapshot. Six canvas instances are initialized once, updated using stable series IDs, resized by ResizeObserver, and disposed on unmount. There is no continuous chart animation or sample smoothing. Normal GPU/compositor rendering is enabled by WebView2 defaults; no software-rendering flag is added. The on-demand 30-second frame check measures rAF intervals and estimates missed refresh opportunities relative to the observed median. It does not measure GPU presentation or establish a sustained FPS guarantee.

## Versioned bridge and security

Both directions now use version 2. Commands remain `ready`, `pause`, `resume`, `reset`, and `configure`. C# rejects oversized (>4096 characters), deeply nested, extra/duplicate-field, unknown-version, invalid-address and out-of-range commands. One command occupies the command slot at a time. Responses are `snapshot`, `traffic`, `ack` or `error`. Traffic batches contain a generation and at most 1204 ordered samples. Zod validates exact schemas, nonnegative finite speeds, valid timestamps/intervals, bounded signal fields, and null metrics for unavailable/baseline states. Old/duplicate sequences are ignored; old generations cannot resurrect cleared data. UI commands await acknowledgments; the heartbeat watchdog marks host data stale after five seconds.

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

## M0.6 presentation and packaging

Wiffer adds an original local SVG detective mark, multi-resolution ICO, mint/copper signal accents, a graphite chassis and circular layered SVG instruments. Needle easing remains display-only; all numbers and histories retain M0.5 semantics. Installed Windows UI and monospace fonts are used without redistribution. The executable/product is Wiffer; internal PulseDeck solution and Core project names remain to avoid unrelated refactoring. The local profile uses the Wiffer application-data directory.

Public captures mask identifiers without modifying measurements. Old local evidence and earlier history are excluded from the public root commit. A self-contained x64 ZIP contains runtime files, frontend assets and licenses; WebView2 Evergreen remains a separate prerequisite. The per-user shortcut targets a stable installation directory and remains valid when copied.
