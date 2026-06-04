# Changelog

All notable changes to react-perfscope are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). All
packages are versioned in lockstep.

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

[0.5.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.5.0
[0.4.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.4.0
[0.3.0]: https://github.com/rayforvideos/react-perfscope/releases/tag/v0.3.0
