# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.7] - 2026-01-29

### Added

- Privacy mode to mask emails, tokens, and API keys during export with a detailed report.
- User profiles to apply personalized export presets from the webview.
- New `privacyReport` field in JSON exports (and AI Pack) with mask statistics.
- Unit tests for privacy masking and filter exclusion reasons.
- Strengthened test assertions to be resilient to whitespace changes.
- Relaxed context optimizer test expectations for truncation behavior.
- PDF export option for Markdown-like output.
- NotebookLM Enterprise upload option with webview toggle.
- Added detailed README instructions for obtaining NotebookLM access tokens.
- Added troubleshooting section for common NotebookLM upload errors.

### Changed

- Export UI now includes profile selector and privacy toggle.
- Simplified export path UX by removing the redundant file name field.
- Added output path copy button and remembered last output path.
- Export dialog now includes "open after export" checkbox, removing the follow-up open prompt.
- Added a read-only operation log panel in the export webview.
- Fixed webview log rendering to avoid template literal parsing errors.
- Fixed NotebookLM upload error handling for Thenable and added local pdf-lib typings.
- Packaged pdf-lib in the VSIX to avoid runtime activation failures.
- Added tslib dependency to satisfy pdf-lib runtime requirements.
- Added @pdf-lib/standard-fonts dependency to satisfy pdf-lib runtime requirements.
- Added pako dependency to satisfy @pdf-lib/standard-fonts runtime requirements.
- Refactored export workflow and NotebookLM integration into dedicated module to slim down extension.ts.
- Migrated filesystem operations to async I/O with controlled concurrency to keep the Extension Host responsive.
- Updated filtering, presets, and export optimization tests for async service APIs.
- Improved Context Optimizer with robust comment stripping and configurable docstring handling.
- Added alias-based dependency resolution using tsconfig/jsconfig path mappings.
- Split the export webview into dedicated HTML template, CSS, and JS assets for easier maintenance.
- Added a `showNotifications` setting to toggle VS Code toast notifications (default off).
- Added a `logVerbose` setting to emit per-operation logs in the webview log (default off).
- Improved export webview UX with summary, extension search, recent paths, and log filtering.
- Added Profile Manager webview (command and button) to edit codeDump.userProfiles without manual JSON.

## [1.4.6] - 2026-01-29

## [1.4.3] - 2026-01-29

## [1.4.2] - 2026-01-29

### Added

- AI Export Pack preset that generates JSON + Markdown in one run.
- Context summary in JSON export with included/excluded files and reasons.
- Auto-generated AI prompt template embedded in both JSON and Markdown output.

### Changed

- Export UI now includes a preset selector with AI-focused defaults.

## [1.4.1] - 2026-01-29

### Fixed

- Remove accidentally included PAT file from package and add `.vscodeignore` to prevent future leaks.

## [1.4.0] - 2026-01-29

### Added

- AI Context Optimizer integration for exports (comment removal, whitespace minification, truncation, max token budget).
- File prioritization pipeline (entry points, shallow paths, optional recent-file bias) to maximize context value.
- JSON metadata dependency map `metadata.dependencies` plus structured `dependencyGraph`.
- Export optimization utility module to centralize prioritization/optimization/budget logic.
- Unit tests for Context Optimizer, Dependency Analyzer, and export optimization helpers.
- `npm test` script (runs compile + node:test on compiled tests).

### Changed

- JSON exports now optionally include optimization stats when the optimizer is enabled.
- Export pipeline respects token budget by skipping files when over limit and uses optimized content in counts.
- Config loading now includes AI context optimizer defaults and dependency graph flag.

## [1.0.0] - 2025-08-01

### Added

- Initial release of **Code Dump to TXT/MD** 🎉
- Context menu integration in VSCode Explorer
- Recursive folder scanning and extension filtering
- Support for `.txt` and `.md` output formats
- Respect `.gitignore` rules
- File size chunking for large exports
- Custom output filename with validation
- Clipboard copy option
- Optional file opening after export
- Workspace and user configuration support
- CLI command `extension.exportCodeCLI` for automation workflows
- `compactMode` setting to minify code into one-liners (useful for AI input)

### Changed

- Improved UX: step-by-step interaction, filename validation, and progress tracking
- Enhanced AI usability through Markdown formatting and chunked output
- Logo and demo preview added to improve marketplace presence

### Removed

- Deprecated punycode warning avoided via updated dependency usage
