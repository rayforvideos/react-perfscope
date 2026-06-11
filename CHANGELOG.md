# Changelog

All notable changes to react-perfscope are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). All
packages are versioned in lockstep.

## [0.7.1] - 2026-06-11

### Fixed

- **Source-mapped stack frames were off by one column.** Stack traces report
  1-based columns while source maps store 0-based ones; every resolved frame
  was shifted one token right in minified bundles. Resolved frames now use
  1-based columns consistently. The resolver also caches the *decoded*
  `TraceMap` per file (not just the raw JSON), so resolving N frames from one
  bundle no longer re-decodes the mappings N times on the main thread.
- **`uninstallDevToolsHook()` no longer disconnects the React DevTools
  extension.** Uninstalling now restores any pre-existing
  `onCommitFiberRoot` / `onCommitFiberUnmount` handlers it had chained to, and
  an uninstall → reinstall cycle no longer makes the old wrapper chain to
  itself (which recursed on every commit).
- **The `/auto` production guard actually works in bundled apps.** It read
  `NODE_ENV` through an optional-chained `globalThis` cast, which bundlers do
  not statically replace and browsers never define — so the guard silently
  never fired. It now uses the bare `process.env.NODE_ENV` expression that
  Vite/webpack/esbuild substitute at build time.
- **The interaction collector no longer pins DOM nodes after a recording.**
  Buffered Event Timing entries (each holding a `target` element) are released
  on finalize, and the buffer is capped at 5,000 entries during very long
  recordings.
- **Render-reason attribution recognizes `forwardRef`/`memo` parents.** Their
  fibers carry an object `type` and were skipped when climbing to the nearest
  component ancestor, misclassifying parent-driven re-renders as `state`.
- **The widget no longer re-renders 60×/s while recording.** The elapsed
  timer is quantized to the displayed second, and the episode panels memoize
  `correlate()` instead of recomputing it on every filter keystroke — less
  self-perturbation in the window being measured.
- **web-vitals subscriptions no longer stack per recorder instance.** The
  library exposes no unsubscribe, so the collector now subscribes once per
  page and fans metrics out to active instances (later instances previously
  missed already-finalized metrics like LCP entirely).
- `mount()` ignores a second call into the same host instead of stacking
  widgets; the leak collector's sampling interval survives a double
  `activate()` without being orphaned.

## [0.7.0] - 2026-06-08

### Added

- **Component memory-leak detection.** A new in-page collector watches
  component unmounts (via React's `onCommitFiberUnmount`), registers each
  unmounted fiber in a `FinalizationRegistry`, and tracks how many instances
  stay retained over time. Components whose retained-instance floor keeps
  climbing are surfaced in the panel's timeline tab as **Suspected leaks**,
  naming the component and its retained/unmounted counts. It identifies *which*
  component leaks and *how many* instances — not the retainer chain (a heap
  snapshot, which in-page JS can't take). Robust to React StrictMode churn.
- New public API: `createLeakCollector`, `onFiberUnmount`
  (`@react-perfscope/react`); `analyzeLeakTrend`, `LeakSample`, `LeakSuspect`,
  and `RecordingResult.leakSuspects` (`@react-perfscope/core`).

## [0.6.0] - 2026-06-08

### Added

- **`createConfiguredRecorder()`** (in `react-perfscope`): assembles the
  recorder and the full collector set the tool ships, minus the UI — for
  programmatic / headless recording. The `/auto` bootstrap now uses the same
  factory, so the two can never drift apart.
- **Browser capability detection** is now public: `detectCapabilities()`,
  `unsupportedKinds()`, and the `Capabilities` type. The panel detects signal
  kinds the current browser cannot measure and says so instead of showing an
  empty tab.
- `BUFFER_CAP` is exported from `@react-perfscope/core`.

### Documentation

- Document Next.js (App Router, Next 15.3+) support via an
  `instrumentation-client.ts` entry — no plugin required.

### Internal

- **Real-browser verification harness** (Playwright + headless Chromium):
  checks recorded signals against the native Performance APIs (long-task/LoAF,
  layout-shift, React Profiler) for accuracy, asserts host-app safety under
  pathological load and idle silence, and smoke-tests the real plugin
  injection path. Includes a non-gating overhead report.
- **Public API surface gate**: snapshots each package's exported signatures so
  unintended breaking changes / surface creep fail CI.
- **Multi-version compatibility matrix** in CI: React 18 & 19, Vite 5–8.

## [0.5.0] - 2026-06-04

### Added

- **Cross-signal correlation** (`correlate()` in core): groups signals into
  interaction- and long-task-anchored *episodes* on the shared
  `performance.now()` clock. Each member carries a confidence tier — `caused`
  when a forced reflow's source location matches an anchor hot frame, or when it
  ran inside a render commit; `co-occurred` for time overlap only — so the tool
  never overclaims causation.
- **INP episode panel**: the interaction tab expands the worst interaction (the
  one that defines INP) into its input-delay / processing / presentation phases,
  attributing the renders, reflows, and layout shifts that occurred in each.
- **Long-task episode panel**: the long-task tab decomposes the longest task
  into what ran during it, with the same attribution and confidence.
- **Reflow → commit attribution**: a forced reflow is linked to the render
  commit that triggered it and shown as "← \<Component\>".

### Fixed

- **Commit render duration no longer double-counts nested fibers.** React's
  `actualDuration` is inclusive (a parent already counts its descendants), so
  summing every member over-counted the deeper the cascade. Now sums only the
  forest roots, matching React's own Profiler.

### Changed

- `@react-perfscope/core`, `/react`, and `/ui` are marked side-effect-free for
  better tree-shaking in consumer bundles.
- The layout-shift tab clarifies that it lists input-driven shifts too (which
  the CLS metric excludes) — it is not a CLS score.

## [0.4.0] - 2026-06-04

### Added

- Panel signal filter: free-text filter over each signal kind's list and the
  render tab's top-renderers, matching component names, URLs, metric names, and
  source functions/files, with an empty-state message when nothing matches.

## [0.3.0] - 2026-06-01

### Added

- Per-commit render coalescing: one signal per commit instead of one per fiber,
  keeping a large re-render from flooding the buffer and UI.

### Documentation

- Measured measurement-overhead section in the README (bilingual EN/KO).

[0.7.1]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.7.1
[0.7.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.7.0
[0.6.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.6.0
[0.5.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.5.0
[0.4.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.4.0
[0.3.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.3.0
