# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
