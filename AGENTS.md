# Wiffer development

M0.8 adds the read-only Wi-Fi Lab to verified M0.7, preserving its digital cockpit, explicit native internet speed testing and telemetry delivery. This is a local Windows 11 diagnostic instrument, not a traffic analyzer. Stop before M1.

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

M0.7 publication is verified: public v0.7.0 release, all 430 ZIP entries compared to the tested package, and unauthenticated downloaded ZIP/checksum agreement. Stable installed executable and shortcut checksums remained unchanged at M0.7 publication. M0.8 is the current authorized milestone; stop after M0.8.

## M0.8 rules

- Read-only Wi-Fi Lab uses one native completion timestamp and one shared display-state calculation for both hero instruments. RSSI, reported quality, negotiated rates and actual interface traffic remain distinct.
- Serialized connection reads target 1 Hz and stop while paused. Native state and BSSID checks discard detected mixed observations; never turn privacy denial or ambiguous MLO into invented data. Native calls are synchronous and shutdown awaits completion; do not claim a hard driver timeout.
- Wi-Fi history stores only received native observations, deduplicates completion timestamps, caps at 600, clears on session/adapter replacement and breaks traces across gaps/detected roaming. It is incremental within the existing 1 Hz snapshot, never a replay or synthetic sample source.
- Radar radius maps measured RSSI (−100 to −40 dBm); quality controls independent lighting. Shared rAF springs are display-only, settle to idle, stop while hidden and honor live reduced-motion changes. Missing RSSI/quality suppresses its respective live field/link.
- No band switching, scans, radio writes, distance/interference/SNR/retry claims or M1. Source commit/push is explicitly authorized for M0.8; no new release is published by this task. Preserve the stable installation, desktop shortcuts and M0.7 evidence.
- M0.8 automated validation: 70 native and 22 frontend tests, TypeScript, production build and Release build pass. See HANDOFF.md for actual WebView2 captures, frame-callback measurements and limitations; rAF is not GPU presentation.
Final M0.8 WebView2 checks pass at 1366×768 and 1920×1080 with four stable Lab charts, exact shared native timestamps/numbers, pause/resume and reduced motion. Both hero pairs and all charts fit. Final Lab rAF median/p95: 6.9/20.6 ms and 7.6/20.6 ms; these are callback opportunities, not GPU presentation. M0.7 cockpit/lifecycle regression checks also pass. See HANDOFF.md and the m08 validation aggregates for phase-dependent snapshot delivery and remaining hardware limits.

## M0.8.1 — completed visual redesign

The explicit M0.8.1 request supersedes the earlier two-hero/radar presentation rules and M0.8 stop marker. Stop after M0.8.1; no M1 or band switching. The Lab now has ONE layered Wi-Fi symbol, at most two short status words, and exact quality/RSSI readings. Keep details in the optional inspector and preserve all four historical charts. RSSI maps to inner-to-outer arc coverage; independent quality maps to edge lighting. Missing values suppress only their associated live layer; stale/paused/disconnected states suppress live readings. Reuse the existing state model and display-only springs; no invented activity.

Observed M0.8.1 validation: 70 native and 22 frontend tests, TypeScript, production build and Release build pass. Actual native WebView2 captures at 1366×768 and 1920×1080, pause/resume, stable charts, native-number/timestamp agreement and reduced motion pass. Isolated UI fixtures cover disconnected/reconnecting/stale/unavailable and independent missing fields; these do not establish physical-network behavior. See HANDOFF.md for final frame-callback observations and limitations. Native/bridge measurement semantics are unchanged. Preserve stable installation, shortcuts and all M0.7/M0.8 evidence. No new release or push is part of M0.8.1.

## M0.8.2 — Wireless Halo

The user-authorized M0.8.2 replaces the earlier arc-symbol presentation rule only. Stop after M0.8.2. One SVG orb with orbital rings and a clockwise quality-calibrated halo: reported quality / 100 directly controls fill, intensity and spring-driven tilt; RSSI remains separate. No generic Wi-Fi arcs, particles, fake activity, new framework or measurement changes. Four mapping/state tests added; 26 frontend and 70 native tests plus required checks/builds pass. Both actual WebView2 viewport captures, calibrated stroke/native-number agreement, stable charts, pause/resume and reduced motion pass. Isolated state fixtures are not hardware tests. See HANDOFF.md for exact local launch path and limitations. Preserve prior evidence and stable installation; no release.

## Focused glass-tile redesign
The latest user-authorized hero replaces orb/arcs/bars with one glass tile. Quality controls fill height via the existing spring; exact numbers do not interpolate. Native data and charts are unchanged. 26 frontend/70 native tests and required builds pass; actual two-viewport and reduced-motion checks pass. See HANDOFF.md for evidence and hardware limitations. No later milestone, push or release.

## Signal Field — latest focused hero
The user-directed Signal Field supersedes previous hero artwork: wide glass surface, flowing contours, quality expansion/illumination and independent RSSI compression. Pointer deformation is cosmetic, spring-driven and reduced-motion aware. Native measurements/charts remain unchanged. 26 frontend and 70 native tests, builds and two-viewport native checks pass, including drag/release and reduced motion. See HANDOFF.md for evidence and touchscreen/hardware limits. No release or later milestone.

## User delivery preference
After future local executable updates, create or refresh the separate ignored `artifacts/Wiffer Latest.lnk` pointing to the verified latest development executable and provide its clickable absolute path in the final response. Preserve stable installation/Desktop shortcuts. The current Signal Field source commit/push is explicitly authorized; this does not authorize release publishing or future pushes.
