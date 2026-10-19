# Wiffer M0.6 handoff

Validated 2026-10-18 (America/Toronto). M0.6 is complete; M1 has not started.

## Changes

- Rebranded the window, executable, metadata, UI, local origin and current documentation as Wiffer, with the tagline “Wiffer — Sniff out your network problems.” Internal PulseDeck solution/project names remain for source continuity.
- Original scalable detective mascot, PNG/favicon and seven-resolution Windows ICO (16–256 px). Installed Windows fonts provide UI/display and precision monospace typography; no font downloads or redistribution.
- Graphite/olive-neutral chassis, ivory text, mint RX and copper TX; circular layered bezels, recessed gauge faces, tick rings, eased needles and separate uncapped instantaneous/weighted-average readings. No rendering dependencies were added.
- All six synchronized charts, summaries, inspector and controls remain. All native M0.5 measurement semantics, cancellation, buffer bounds and bridge v2 remain unchanged.
- Self-contained Windows x64 ZIP with runtime, local frontend, install script, MIT license and dependency notices. Per-user installation under `%LOCALAPPDATA%\Programs\Wiffer`; the absolute-target shortcut can be copied anywhere on this PC while that installation stays in place.

## Validation

Passed on the delivered source:

```powershell
npm --prefix ui run check
npm --prefix ui test
npm --prefix ui run build
dotnet test PulseDeck.slnx --no-restore -m:1 -p:UseSharedCompilation=false
dotnet build PulseDeck.slnx -c Release --no-restore -m:1 -p:UseSharedCompilation=false
dotnet publish src/PulseDeck.Windows/PulseDeck.Windows.csproj -c Release -r win-x64 --self-contained true -t:Rebuild -p:DebugType=None -p:DebugSymbols=false -o artifacts/release-win-x64 -m:1 -p:UseSharedCompilation=false
```

- Native: **46 passed**, no failures/skips. Frontend: **12 passed**. TypeScript and production build passed. Solution Release build: **zero warnings/errors**. The final publish also mapped the local source root to a neutral build path and omitted PDBs.
- Vite retains dependency annotation notices and an approximately 870 KB JS chunk warning. No runtime error was observed.
- Actual WPF/WebView2 verification passed pause/frozen clock and statistics, reset while paused, resume/native data, all six imported summaries, invalid duplicate-target rejection, shared windows, expansion/collapse, hover and stable six ECharts instance IDs.
- Exact CSS viewports 1366×768 and 1920×1080: no horizontal overflow, six charts visible (chart bank bottom 741 and 1002 px). Inspector/notes/footer can require vertical scrolling. Both screenshots were visually inspected.
- Final installed application launched via a copied shortcut. Verified title, native bridge connection, 12 inspector fields, six charts, fixed 10 Mbps dial selection, local mascot load and reduced-motion preference. Test app closed normally.
- The temporary debugging port is development-only and is not configured in normal launch.

Real screenshots are in `docs/screenshots/`. Network identifiers are masked at capture time; measurement numbers and traces are unchanged. No SSID inspector capture is published. `validation.json` contains aggregate checks and timing only; raw snapshots stay ignored locally.

## Measured presentation performance

Each viewport ran a 30.004-second requestAnimationFrame check with real native data and six charts:

- 1366×768: 7,159 callbacks; median 4.2 ms, p95 4.3 ms, maximum 12.6 ms; 32 intervals above 1.5× median; 41 estimated missed refresh opportunities.
- 1920×1080: 7,134 callbacks; median 4.2 ms, p95 4.3 ms, maximum 87.6 ms; 32 intervals above 1.5× median; 66 estimated missed refresh opportunities.
- 477 measured traffic samples; monotonic intervals 0.221–0.299 seconds.

These are browser callback intervals, not GPU present events. Visibility was reported as visible; system load/foreground conditions were not controlled. No sustained 120 FPS guarantee, before/after performance improvement or long-run claim is made.

## Limitations

- Windows 11 x64 only; WebView2 Evergreen must already be installed. ZIP distribution is unsigned, not an MSI/MSIX installer. Clean second-PC deployment is not validated.
- No Task Manager numerical comparison, sustained outbound-transfer calibration, physical disconnect/reconnect, sleep/resume, VPN/multiple-physical-adapter, 125%/150% DPI, long soak, exhaustive accessibility audit or GPU-present trace was performed for this milestone.
- Unsupported or ambiguous Wi-Fi fields remain unavailable; no scans, elevation, inferred RSSI or driver retry/frame-failure claims. Native Wi-Fi calls remain synchronous background calls awaited during shutdown.
- Traffic is selected physical-interface traffic including LAN and other apps, not internet capacity. Adapter choice can differ from the actual routed ICMP path, especially with VPNs. No packet inspection, automatic speed tests, database, account or M1 features.
- Historical records remain six supplied summaries without dates or reconstructed samples. Personal household context was generalized for publication.

## Publication and local preservation

Public repository: https://github.com/shafaii/wiffer

Release: https://github.com/shafaii/wiffer/releases/tag/v0.6.0

The public branch starts from a sanitized root commit so earlier private paths, Git email and diagnostic evidence are not in public ancestry. Existing M0 history remains on the local development branch; M0.5 implementation is included in M0.6. Old evidence and the previous handoff remain on disk in ignored local files. No secrets, raw snapshots, test downloads, debug symbols or machine-specific shortcuts belong in the release.

Git source publication uses `codex/m06-public` → `origin/main`, with `v0.6.0` for the release. The final chat records verified URLs and publication status. Future changes must stay before M1 unless separately authorized.

## Launch

```powershell
& "$env:LOCALAPPDATA\Programs\Wiffer\Wiffer.exe"
Copy-Item "$env:LOCALAPPDATA\Programs\Wiffer\Wiffer.lnk" ([Environment]::GetFolderPath('Desktop')) -Force
```

Keep the installed directory together. The shortcut targets its absolute executable path and embedded icon; moving the shortcut is supported, moving the installation requires recreating it.
