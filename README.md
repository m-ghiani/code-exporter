# Code Dump to TXT/MD

Export your workspace into a single `.txt`, `.md`, or `.json` file for AI tools, documentation, or archiving.

![Code Dump logo](logo.png)

---

## Visual walkthrough

![Export demo](demo.gif)

---

## Quick start

### Context menu (recommended)
1) Right-click a folder in the VS Code Explorer.
2) Choose **Export Code to TXT/MD**.
3) Select extensions, template, and output format.
4) Save the file.

### Command palette
1) Press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS).
2) Run **Code Dump: Export Current Workspace**.
3) Follow the prompts.

---

## What you get

### Markdown / Text export
- One file (or chunked parts) with your code.
- Optional metadata per file.
- Token estimates shown during export.

### JSON export (structured)
Includes per-file metadata and optional dependency graph.

Example JSON metadata:
```json
{
  "metadata": {
    "exportedAt": "2026-01-29T12:34:56.000Z",
    "sourceFolder": "my-project",
    "totalFiles": 42,
    "totalSize": 123456,
    "totalLines": 7890,
    "estimatedTokens": 30864,
    "extensions": [".ts", ".md"],
    "version": "1.0",
    "dependencies": {
      "src/index.ts": ["src/utils.ts", "src/types.ts"],
      "src/utils.ts": ["src/types.ts"]
    }
  },
  "files": []
}
```

---

## AI Context Optimizer

Reduce token usage automatically during export.

```json
{
  "codeDump.aiContextOptimizer": {
    "enabled": true,
    "maxTokenBudget": 100000,
    "removeComments": true,
    "minifyWhitespace": true,
    "truncateLargeFiles": true,
    "maxLinesPerFile": 500,
    "prioritizeRecentFiles": true
  }
}
```

What it does:
- Removes redundant comments.
- Minifies extra whitespace.
- Truncates large files with a `// ... truncated ...` marker.
- Prioritizes entry points and recent files when the token budget is tight.

---

## Settings

Add these to your `settings.json`:

```json
{
  "codeDump.defaultExtensions": [".ts", ".js", ".py"],
  "codeDump.outputFormat": ".md",
  "codeDump.openAfterExport": true,
  "codeDump.copyToClipboard": false,
  "codeDump.compactMode": false,
  "codeDump.dryRun": false,
  "codeDump.skipEmptyFiles": "ask",
  "codeDump.showTokenEstimate": true,
  "codeDump.includeMetadata": false,
  "codeDump.includeDependencyGraph": true
}
```

### Smart filters
```json
{
  "codeDump.smartFilters": {
    "autoExclude": ["node_modules", "dist", "build", ".git", "coverage"],
    "maxFileSize": "1MB",
    "skipBinaryFiles": true,
    "excludePatterns": ["*.log", "*.tmp", "*.cache"]
  }
}
```

---

## Tips

- Use **JSON export** if you want to feed data into tools or build custom pipelines.
- Enable **AI Context Optimizer** to stay within model limits.
- Use **Compact Mode** to shrink output further.
- Add `.codedumpignore` for project-specific exclusions.

---

## Development

```bash
npm install
npm run compile
npm run package
```

---

## License

MIT. See `LICENSE`.
