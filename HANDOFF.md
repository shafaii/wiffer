# Wiffer M0.8 handoff — Wi-Fi Lab

Validated 2026-10-21 (America/Toronto). M0.8 is a source milestone; the public packaged release remains M0.7. Stop after M0.8. Band switching and M1 are not implemented.

## Delivered

- **Signal radar:** original dimensional SVG instrument with calibrated dBm rings, precision markers, restrained glacier-blue lighting and an actual-RSSI field radius. Exact RSSI, independent driver quality, connected band, completion timestamp and freshness remain visible. The field is not physical distance.
- **Connection bridge:** original faceted PC/access-point nodes, layered quality-responsive beams and a short measurement-change response. No particles, random traffic or perpetual sweep. It shows actual band/channel, separate negotiated RX/TX and independently timestamped gateway RTT.
- One native observation, one shared state and one rAF spring clock drive both heroes. Critically damped motion stops on convergence or hidden pages; live reduced-motion changes apply immediately. Unavailable RSSI and quality independently suppress their respective live visuals. Exact numbers and history never interpolate.
- Four stable linked ECharts instruments: RSSI, reported quality, negotiated RX/TX and gateway RTT. Shared 60-second/five-minute window, bounded 600-observation history, timestamp deduplication, nulls and gap/roam breaks. History continues receiving native snapshots when another tab is selected and resets with sessions/adapter replacement.
- Expandable 12-field inspector: adapter, SSID/BSSID, adapter MAC, band/channel, radio type, authentication, cipher, connection mode, native state and UTC completion time. Unknown fields remain unavailable. Association rates, received power, quality and actual local traffic are explicitly distinguished.
- Approximately 1 Hz serialized native connection polling, suspended while paused. Resume revalidates the route before probes restart. Interface-state and BSSID brackets discard detected mixed observations. M0.7 probe lifecycle, 600-probe/1204-traffic buffers, 4 Hz traffic delivery, strict bridge v2, local-origin restrictions and explicit fixed-endpoint speed testing remain.

## Native measurements and limits

Real Windows observations supplied RSSI, reported quality, 5 GHz band, channel 157, negotiated rates and association/security/MAC fields throughout both measured windows. The real captures show −61 dBm and 82% quality; rates vary with the driver. Values are observations of this PC, not universal accuracy or capacity guarantees. The existing real-time Native Wi-Fi opcode 19 and RSSI/channel fallback paths remain. Opcode 7's bounded SDK structure supplies association details; opcode 6 supplies connection state. Enum/layout references are in ARCHITECTURE.md. No SSID-to-location lookup, scans, elevation or wireless writes occur.

Windows does not expose a single atomic observation across these queries. State/BSSID bracketing detects some transitions, but very fast roaming, privacy-hidden identities and MLO cannot be proven atomic. MLO band/channel/RSSI remain unavailable rather than aggregated. A disabled/missing driver or privacy denial does not generate zero signal. Synchronous Windows calls cannot be canceled mid-call; lifecycle operations await their completion. No hard driver-hang deadline is claimed.

Display states use documented UI thresholds, not causal diagnoses: weakening is at least a 4 dB drop across 2–4.5 seconds; degraded is below −75 dBm or below 40% quality. Older than 3.5 seconds is stale, evaluated on a one-second freshness tick. Reconnecting requires a native discovery/association/authentication state. Gateway ICMP follows Windows routing and is not an atomic wireless RTT or proof of wireless causation.

## Tests and captures

- **70 native tests and 22 frontend tests passed**, no failures or skips. Tests cover new association/security/state parsing, known roaming invalidation, serialized refresh, frozen polling, resume after adapter replacement, strict bridge fields, bounded/deduplicated histories, gaps, null states and state thresholds. Existing spring convergence tests at 60/120/240 Hz and all M0.7 speed-test/counter/probe tests remain passing.
- TypeScript, frontend production build and Release solution build passed. Release: zero warnings/errors. Vite retains upstream Zod annotation notices and the bundle-size warning (approximately 898 KB JavaScript). No new runtime dependency or 3D engine.
- Real WebView2 checks passed exact hero/native-number comparisons, identical timestamps, four stable chart instances across viewport/window/control changes, pause/resume, reduced motion and the technical inspector. Final screenshots were visually inspected at both exact CSS viewport sizes, at the top of the page, with the full hero pair and all four charts visible. Inspector expansion can require vertical scrolling.
- [1366×768 Wi-Fi Lab](docs/screenshots/m08-wifi-lab-1366x768.png) · [1920×1080 Wi-Fi Lab](docs/screenshots/m08-wifi-lab-1920x1080.png) · [Validation and timing](docs/screenshots/m08-validation.json). Captures use genuine native data. Solid masks hide adapter/routing identifiers without changing measurements; raw snapshots and earlier development captures remain ignored locally.

The preserved M0.7 WebView2 regression harness also passed: frozen probes/traffic/clock/statistics on pause, reset/resume, all six imported summaries, duplicate-target rejection, six stable ECharts instances across window changes and expansion, and both viewport layouts. Cockpit chart bottoms were 756.00 / 999.61 px. [Regression aggregate](docs/screenshots/m08-regression.json). Old M0.7 screenshots were preserved; new regression captures and raw snapshots stay ignored locally.

Required commands:

```powershell
npm --prefix ui run check
npm --prefix ui test
npm --prefix ui run build
dotnet test PulseDeck.slnx --no-restore -m:1 -p:UseSharedCompilation=false
dotnet build PulseDeck.slnx -c Release --no-restore -m:1 -p:UseSharedCompilation=false
```

The restricted test invocation could not connect to testhost IPC; the same suite passed with local IPC enabled. This was an execution-environment limitation, not a test failure. The opt-in verification launcher used an isolated WebView2 profile and temporary localhost debug port; neither is added to normal application startup.

## Measured rendering and delivery

- 1366×768, 30.00 s: rAF median / p95 **6.9 / 20.6 ms** (3637 callbacks; maximum 21.2 ms). Received 29 distinct native observations. Observation cadence median / p95 **1001 / 1033 ms**; maximum 1041 ms. Native completion → snapshot JS receipt median / p95 **557 / 833 ms** (same-machine wall-clock estimate). Charts end at 743.59 px with the page at scrollY=0; no horizontal overflow.
- 1920×1080, 30.00 s: rAF median / p95 **7.6 / 20.6 ms** (3162 callbacks; maximum 25.2 ms). Received 29 distinct native observations. Observation cadence median / p95 **1005 / 1039 ms**; maximum 1988 ms. Native completion → snapshot JS receipt median / p95 **367 / 955 ms** (same-machine wall-clock estimate). Charts end at 1053.78 px with the page at scrollY=0; no horizontal overflow.

These are 30-second observations with the debugger attached and ordinary uncontrolled desktop workload. rAF opportunities are **not GPU presentation**, sustained FPS, battery or CPU guarantees. Earlier exploratory runs had lower callback p95 values; the final source run above is the reported evidence. No M0.8 process-CPU benchmark was performed.

Wi-Fi acquisition and the preserved one-second snapshot timer are independent. The phase difference can delay delivery by nearly one second and coalesce an observation when phases cross; repeated timestamps are deduplicated, not relabeled as new measurements. This differs from M0.7's acquisition-triggered 4 Hz traffic pipeline. The UI preserves native completion timestamps and freshness, and makes no 1 ms Wi-Fi delivery claim.

## Preservation and remaining verification

The stable installed executable still matches the preserved pre-M0.7 checksum. The current Desktop Wiffer.lnk matches the preserved shortcut checksum. Other desktop shortcuts were not edited. The older recorded installation-folder shortcut path is absent, but the matching desktop shortcut is present. No install, shortcut update, release packaging, tag or release publication was performed. M0.7 screenshots, release assets and prior local evidence remain intact.

Physical disconnect/reconnect, live roaming, MLO hardware, location-policy changes, alternate adapters/VPN routing, high-DPI, long soak and clean second-PC execution remain unvalidated scenarios. Controlled parser/state/lifecycle tests cover the relevant failure paths but do not replace those hardware checks. No live bandwidth-consuming speed test was rerun for M0.8; its native implementation is unchanged and its regression tests pass. No band switching, inferred distance/interference/SNR/retries, traffic analysis or later milestone work was added.

---

# Preserved M0.7 handoff (historical validation)

Validated 2026-10-19 (America/Toronto). M0.7 is complete; M1 has not started.

## Delivered behavior

- Midnight graphite, sky/glacier blue and icy-white cockpit. The old circular speedometers and needles are removed. Angular layered SVG instruments provide depth, edge lighting, glass reflections, restrained trails and display-only critically damped spring motion, without new runtime dependencies.
- Exact instantaneous local traffic numbers, separate three-second weighted averages, dynamic/fixed arc scales and reduced-motion behavior. All six synchronized charts, original historical summaries, inspector and controls remain.
- Explicit native Quick Speed Test using Cloudflare's documented HTTPS transfer endpoints. Two streams per direction, ten-second phase limits, 35-second total deadline, 256 MB download / 128 MB upload payload caps. Real received/server-confirmed bytes and Stopwatch intervals; live rates, final means, HTTP idle/loaded latency, edge code, progress, cancellation and clear errors.
- Warning precedes Start test. No automatic testing, result-report submission, browser remote access or LAN-capacity claim. Test results include HTTP overhead and may understate high-capacity links. Upload live values count confirmed request bodies and can arrive in bursts.
- Direct GUID → LUID → GetIfEntry2 counter reads replace per-sample full NIC enumeration. Identity, operational state and physical-interface flags are checked every read. Production cadence stays approximately 4 Hz, preserving 1204 samples and five-minute coverage. ICMP stays 1 Hz per endpoint; inspector stays every three seconds.
- Traffic delivery is triggered by sample completion using one coalesced dispatcher callback; one-second snapshots and stable chart instances remain separate. Diagnostics include actual cadence, provider duration, acquisition/bridge/frame-callback timing and sequence gaps. Pending rAF diagnostics callbacks are bounded while hidden.

## Validation

Required commands passed on final production source:

```powershell
npm --prefix ui run check
npm --prefix ui test
npm --prefix ui run build
dotnet test PulseDeck.slnx --no-restore -m:1 -p:UseSharedCompilation=false
dotnet build PulseDeck.slnx -c Release --no-restore -m:1 -p:UseSharedCompilation=false
dotnet publish src/PulseDeck.Windows/PulseDeck.Windows.csproj -c Release -r win-x64 --self-contained true -t:Rebuild -p:DebugType=None -p:DebugSymbols=false -o artifacts/m07-final-win-x64 -m:1 -p:UseSharedCompilation=false
```

The actual publish additionally mapped the local source root to a neutral build path. No PDBs are packaged.

- **61 native / 16 frontend tests passed**, no failures/skips. Release build: zero warnings/errors. TypeScript and production build passed. Vite still reports upstream Zod annotation notices and an approximately 878 KB chunk warning.
- Tests cover numerical byte/time accuracy, bounded results, explicit start, overlap rejection, cancellation in both directions, awaited disposal, deadline errors, slow/unavailable/redirected/truncated servers, network-change invalidation, strict bridge schemas, spring convergence at 60/120/240 Hz, bounded hidden-window callbacks and batch-gap accounting.
- 20 native counter reads matched bracketing managed API counters on the real selected adapter. Existing native baseline/reset/wrap/disconnect/replacement tests remain passing.
- Actual WPF/WebView2 checks passed pause/frozen clock/statistics, reset/resume, duplicate-target rejection, six imported summaries, hover, expansion/collapse, shared windows, and stable six ECharts instance IDs. Final package smoke additionally checked both digital instruments, absence of needles, fixed range, reduced motion, pause/resume, inspector fields and diagnostics.
- Final CSS viewport 1366×768: chart bottom 756.00 px; 1920×1080: 999.61 px. No horizontal overflow. Six charts fit both; inspector/notes can require vertical scrolling. Screenshots are real and visually inspected, with identifiers masked and measurements unchanged.
- Live final speed-test implementation: **500.26 Mbps down / 238.64 Mbps up**, 4.09 / 4.29 second windows, 256 / 128 MB. Edge: Cloudflare edge / YYZ. Idle HTTP latency 85.14 ms; loaded down/up 66.69 / 92.27 ms. Total 8.75 seconds. A separate live cancellation stopped in 79 ms and cleared final results. These are observations of this connection, not capacity guarantees.
- Full live speed-test checks preceded the last diagnostics-only bounded-callback/timing refinement; the unchanged transfer implementation and final strict bridge were already exercised. The final package was rebuilt, retested, launched, benchmarked and smoke-checked after that refinement.

## Actual performance

Full aggregate observations are in [m07-performance.json](docs/screenshots/m07-performance.json), with regression checks in [validation.json](docs/screenshots/validation.json). Raw native snapshots stay ignored locally.

- 1366×768, 30 seconds: sample → JS wall-clock p50/p95 **1.00 / 1.00 ms**, versus M0.6 **137.00 / 245.00 ms**. Native cadence 3.84 Hz; provider p95 0.66 ms; sample → host p95 0.30 ms. JS → next rAF p95 5.60 ms; changed readout DOM commit p95 1.20 ms. 115 batches, 0 observed gaps. rAF median/p95 4.20 / 6.70 ms (6487 callbacks), maximum 20.80 ms.
- 1920×1080, 30 seconds: sample → JS wall-clock p50/p95 **1.00 / 1.00 ms**, versus M0.6 **132.00 / 251.00 ms**. Native cadence 3.85 Hz; provider p95 0.58 ms; sample → host p95 0.27 ms. JS → next rAF p95 5.40 ms; changed readout DOM commit p95 1.10 ms. 116 batches, 0 observed gaps. rAF median/p95 4.20 / 7.20 ms (6245 callbacks), maximum 29.20 ms.

The original 4 Hz provider benchmark had p95 19.62 ms per read versus 0.36 ms optimized. Requested 4/8/16/32 Hz achieved 3.90/7.71/15.05/28.96 Hz, with no read errors; timer granularity prevented exact high-rate cadence. The 32 Hz provider-only CPU sample was 0.52% of one logical core. These short CPU samples are coarse and should not be interpreted as steady-state guarantees. Production remains 4 Hz to retain bounded history coverage.

Inspector reads at requested 0.33/1/2 Hz and gateway probes at 1/2/4 Hz completed without overlapping calls. Public ICMP was deliberately capped at 1 Hz. Raising production probe/inspector rates would add traffic or queries without established diagnostic benefit.

Final full Wiffer + descendant WebView2 CPU observation: 46.91 CPU seconds over 60.96 wall seconds, **76.94% of one logical core**, or about 3.85% of this 20-logical-processor machine. The debugger was attached; no speed test ran during this CPU/pipeline window. This is not a battery or long-run CPU guarantee.

M0.6 and M0.7 observations used the same PC, but background workload/foreground conditions were not laboratory-controlled; some earlier regression captures overlapped builds. Use the final dedicated pipeline window for the final package timings. The improvement is supported by acquisition and delivery measurements, not an asserted GPU/FPS improvement. rAF and DOM commits are not GPU present events; no sustained 120 FPS guarantee is made.

## Security, preservation and limits

Bridge v2 remains strict in both directions. The packaged local browser origin, CSP, navigation, request and permission restrictions remain intact. Only native fixed-endpoint test code gains explicit remote HTTPS access. Cloudflare receives the public IP/test requests; no result-report request is sent.

The original stable per-user Wiffer executable and its installation-folder shortcut remain untouched and checksum-verified; the release candidate uses a separate ignored folder. No desktop shortcut was overwritten. Older local evidence and M0.6 handoff remain in ignored artifacts and Git history. Public files contain no raw snapshots, SSIDs, private gateway addresses, local shortcuts or machine paths.

Remaining limitations: no physical unplug/reconnect or Wi-Fi roaming test was performed; lifecycle/network-change behavior is covered with controlled providers/cancellation tests. VPN/multiple adapters, high-DPI, long-duration soak, metered-link policies and clean second-PC deployment remain unvalidated. Higher provider benchmark rates are short observations, not production settings. Test HTTPS routing may differ from the selected physical monitor interface. No LAN capacity endpoint, driver retry/frame-failure counters, accounts, persistence, automatic tests, M1 or later features were added.

## Release

Repository: https://github.com/shafaii/wiffer
Release target: https://github.com/shafaii/wiffer/releases/tag/v0.7.0

Windows x64 ZIP includes the self-contained .NET runtime, local assets, licenses and optional per-user install script. WebView2 Evergreen is still required. The build is unsigned. SHA256SUMS.txt accompanies the release. Publication and downloaded-asset verification are recorded below after upload.

## Publication verification

Published 2026-10-20 (America/Toronto): https://github.com/shafaii/wiffer/releases/tag/v0.7.0 .

Release source/tag commit: 0077358897d2827dafd7ee425539778cc18357fc. The public Windows ZIP is 66,139,015 bytes. All 430 archived files were compared with the tested package before upload. An unauthenticated public download matched both the local archive and the published SHA256SUMS.txt:

```text
1f9cf931ed16018c3086c0010f8a07e853605820424c8de5789e69dd94050948  Wiffer-0.7.0-win-x64.zip
```

The release is public, non-draft and non-prerelease. The stable installed executable and installation-folder shortcut still match their preserved checksums. No desktop shortcut was overwritten. The verification app is closed; temporary debugging was only configured in the verification launcher, never in the app or normal shortcut.
