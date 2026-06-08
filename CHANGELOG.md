# Changelog

All notable changes to react-perfscope are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). All
packages are versioned in lockstep.

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

[0.6.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.6.0
[0.5.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.5.0
[0.4.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.4.0
[0.3.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.3.0
