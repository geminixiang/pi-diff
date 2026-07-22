# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Make `/diff` open the iterative browser-based review queue for agent changes.
- Sort the review queue by file modification time and restore a file when its diff changes after review.
- Add GitHub-style drag-to-highlight old/new-line range comments and submit them to the active Pi agent.
- Remove the `vs HEAD` tab from the review sidebar to keep the workflow focused.
- Wrap long diff content without changing diff2html's row and line-number layout.

### Tests

- Cover review queue filtering, feedback formatting, and review page controls.

## [0.2.3] - 2026-07-22

### Fixed

- Render untracked symbolic links to directories instead of failing with a `Could not access '<path>/null'` error.

### Changed

- Add npm version, license, and CI status badges to the README.

### Tests

- Cover untracked directory symbolic links in the diff viewer test suite.

## [0.2.2] - 2026-06-28

### Added

- Show diff server connection status with a green or red favicon and navigation bar status dot.

## [0.2.1] - 2026-06-28

### Changed

- Show the current branch in the page title and navigation metadata.

### Tests

- Cover Git worktree repositories in the diff viewer test suite.

## [0.2.0] - 2026-06-28

### Added

- Watch working tree and Git metadata changes with `chokidar` so the diff page refreshes only while browser clients are connected.

### Performance

- Reduce idle Git status polling and coalesce bursty file changes before recomputing the diff reload key.

### Tests

- Add `npm run perf` to guard watcher coalescing and ignored-file behavior.

## [0.1.2] - 2026-06-28

### Fixed

- Persist the diff header Viewed collapse state across refreshes and redraws, and clear it when a file's diff changes.

### Changed

- Update the README heading to the published package name.

## [0.1.1] - 2026-06-28

### Fixed

- Show untracked files in the working tree diff view and include them in auto-refresh detection.

## [0.1.0] - 2026-06-24

### Added

- Persist viewed file checkboxes in the sidebar and clear them when a file's diff changes.
- Auto-refresh the diff page when working tree or staged changes update.

## [0.0.6] - 2026-06-24

### Added

- Show the project name in the header using `package.json`, GitHub remote, then folder name fallback.
- Add a report flag link to the project issues page at the start of the header icon list.

## [0.0.5] - 2026-06-24

### Changed

- Simplify the footer diff status to a subtle underlined `diff` link.

## [0.0.4] - 2026-06-24

### Added

- Detect the current GitHub repository and branch, and add header links to open the repo, branch tree, and a new pull request.
- Sidebar now lists changed files and supports switching between unified and split diff views.

### Changed

- Redesign the sidebar with tabs and a flush, no-rounded-corners layout.
- Remove the search input from the sidebar.

## [0.0.3] - 2026-06-24

### Added

- README now includes a demo screenshot.

## [0.0.2] - 2026-06-24

### Added

- Rename command to `/diff` (was `/pi-diff`).
- Show a clickable footer status link while the diff server is active.
- CI workflow and automated npm publish on GitHub releases.

### Changed

- README install instructions now use `pi install npm:@geminixiang/pi-diff`.
- Simplify package metadata and published files for npm distribution.

## [0.0.1] - 2026-06-24

### Added

- Initial release: open a GitHub-like git diff viewer in the browser.
