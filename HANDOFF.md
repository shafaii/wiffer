# Wiffer M0.7 handoff

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
