# Wiffer milestone boundary

## M0 — Windows live network observatory

Implemented scope:

- Windows 11 WPF/.NET 10 host and locally bundled WebView2/React interface.
- Native independent gateway/internet ICMP probes, automatic gateway detection, manual IPv4 target selection and configurable timeout.
- Bounded samples, rolling metrics, dual-trace interactive chart, focus/linear scales and 60-second/5-minute views.
- True pause/resume, reset, route/disconnection handling, cancellation and clean shutdown.
- Non-live display of the six provided historical summaries and observation context.
- Strict bridge validation, restricted content surface, fake-provider tests and local release packaging.

M0 validation evidence and remaining manual checks are recorded in HANDOFF.md. A manual check that remains unverified is not marked complete by inference.

## M0.5 — Complete local instrumentation

Implemented: measured 4 Hz physical-interface throughput, dual precision dials, six synchronized charts, a Native Wi-Fi/connection inspector, incremental bridge v2 traffic updates, and measured presentation checks. The M0 ICMP lifecycle and six imported summaries remain intact. Detailed validation and limitations are in HANDOFF.md.

Optional driver retry/frame-failure diagnostics remain unimplemented because meaningful driver support was not established. This completes M0.5 and stops before M1.

## Later milestones

M1–M3 are not specified or implemented in this repository. Any future milestone requires a separate user request and design decision. There is no database, sync, account system, household-device monitoring, packet capture, AI diagnosis, automatic speed testing, alert engine, service or installer in M0.

## Reproduce M0

Install and run using README.md. Build/publish with:

```powershell
npm --prefix ui ci
npm --prefix ui run build
dotnet restore PulseDeck.slnx
dotnet build PulseDeck.slnx -c Release --no-restore -m:1 -p:UseSharedCompilation=false
dotnet test PulseDeck.slnx -c Release --no-build --no-restore -m:1
dotnet publish src/PulseDeck.Windows/PulseDeck.Windows.csproj -c Release -r win-x64 --self-contained true -o artifacts/win-x64 -m:1 -p:UseSharedCompilation=false
& .\artifacts\win-x64\PulseDeck.exe
```

## M0.6 — Wiffer

Premium UI, original vector mascot, dimensional traffic dials, privacy-safe real screenshots, per-user launcher and public source/release packaging. Native M0.5 semantics remain unchanged. Stop before M1.

## M0.7 — Digital cockpit and explicit internet testing

Angular layered digital instruments, a midnight/sky/glacier palette, native bounded Cloudflare HTTPS speed testing, direct GUID-addressed interface counters, immediate incremental traffic delivery and measured diagnostics. All six charts, historical summaries and M0.6 controls remain. The stable local installation is preserved. Stop after M0.7; M1 has not started.
