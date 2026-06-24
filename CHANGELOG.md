# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
