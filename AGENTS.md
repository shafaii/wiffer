# Wiffer development

M0.7 adds the digital cockpit, explicit native internet speed testing, and measured telemetry delivery optimization to verified M0.6. This is a local Windows 11 diagnostic instrument, not a traffic analyzer. Stop before M1.

- Keep native probing in `src/PulseDeck.Core`; never generate live telemetry in JavaScript.
- Preserve bounded buffers, one in-flight probe per endpoint, awaited cancellation, and explicit failure statuses. Canceled probes are not packet loss.
- Native throughput is selected physical-interface byte deltas over monotonic elapsed time, sampled around 4 Hz. It is LOCAL PC TRAFFIC, including LAN traffic, never internet capacity or a negotiated Wi-Fi rate.
- Reset the traffic baseline on pause/resume, counter reset/wrap, invalid intervals, read failure and adapter replacement. Unavailable data is null, not zero. Keep probe histories at 600 and traffic history at 1204 samples.
- Use bridge version 2 for commands, snapshots and incremental traffic batches. Keep the 1 Hz probe/connection snapshot separate from 4 Hz traffic batches; keep chart instances stable.
- Treat Wi-Fi fields independently. Use bounded Native Wi-Fi parsers, no scans or privilege escalation. Do not derive RSSI from quality or band from an ambiguous channel. Driver retry/frame-failure counters remain outside validated scope.
- Validate both directions of the versioned bridge. Restrict content, requests, navigation and permissions to the packaged local origin.
- Historical records are summaries only. Never reconstruct individual samples or invent dates.
- Keep all fonts/assets local. No accounts, telemetry services, automatic speed tests, database or later milestone features.
- Changes to measurement semantics require targeted tests. Run `npm --prefix ui run check`, `npm --prefix ui test`, `npm --prefix ui run build`, `dotnet test PulseDeck.slnx`, and `dotnet build PulseDeck.slnx -c Release`.
- Update AGENTS.md, ARCHITECTURE.md and HANDOFF.md with observed validation and limitations. Keep performance claims tied to actual measurements; browser frame callbacks are not GPU present events. Do not push without explicit authorization.

M0.7 preserves Core project paths and local traffic measurement semantics. Publishing M0.7 is explicitly authorized. The existing stable installation and desktop shortcut must remain intact. Keep old local evidence and machine-specific shortcuts out of the public tree. See HANDOFF.md for validation and limitations.
Observed M0.7 validation: 61 native and 16 frontend tests pass; TypeScript, production build, Release build and x64 publish pass. See HANDOFF.md for final WebView2/release checks, actual timing, and unvalidated physical-network/high-DPI/second-PC scenarios; do not infer guarantees from these checks.

- Quick Speed Test is native, explicit-only and fixed to Cloudflare HTTPS transfer endpoints. No remote URLs from bridge commands, redirects, cookies, result-reporting service or automatic starts. Bound the test to 35 seconds and 256 MB download / 128 MB upload payload; cancel and await all streams on user cancellation, network address change, pause/reset/settings and shutdown.
- Read physical-interface counters via GUID → LUID → GetIfEntry2, revalidating identity/status each time. Keep the 4 Hz / 1204-sample production history; benchmarks at higher rates do not authorize reduced coverage.
- Send traffic on sample completion with a coalesced dispatcher callback. Diagnostics distinguish monotonic native timing, wall-clock bridge estimates and rAF opportunities; none establishes GPU presentation.
- Digital arcs use display-only critically damped springs. Exact instantaneous and weighted average numbers never interpolate.
Final WebView2 validation passed at 1366×768 and 1920×1080 with six stable charts. Final sample → JavaScript wall-clock p95 was 1 ms at each viewport, with zero observed batch gaps; rAF p95 was 6.7/7.2 ms and does not establish GPU presentation. Full data and remaining limitations are in HANDOFF.md.
