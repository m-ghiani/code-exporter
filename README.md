<p align="center">
  <img src="https://raw.githubusercontent.com/m-ghiani/code-exporter/refs/heads/main/logo.png" width="160" alt="Code Exporter Logo"/>
</p>

<h1 align="center">Code Dump to TXT/MD</h1>
<p align="center">🔁 Export your source code to a single .txt or .md file – ideal for AI tools, documentation, and archiving</p>

<p align="center">
  <img src="https://img.shields.io/visual-studio-marketplace/v/mghiani.code-to-txt-exporter-mg?label=VSCode%20Marketplace" />
  <img src="https://img.shields.io/github/stars/m-ghiani/code-exporter?style=social" />
  <img src="https://img.shields.io/github/license/m-ghiani/code-exporter" />
</p>

---

## ✨ Features

### 🎯 Smart Exportß

- **Project Detection**: Automatically detects React, Vue, Angular, Python, Rust, Go, Flutter projects
- **Smart Filtering**: Auto-excludes `node_modules`, `dist`, `build`, `.git`, and other common directories
- **Binary File Detection**: Automatically skips binary files
- **File Size Limits**: Configurable maximum file size filtering

### 📊 AI-Ready Export

- **Token Estimation**: Real-time token count for ChatGPT/Claude usage cost estimation
- **Multiple Templates**: Choose from default, compact, metadata-rich, or AI-optimized formats
- **Chunking**: Automatically splits large exports into manageable chunks
- **File Statistics**: Lines of code, file types, and size analytics

### 🎨 Flexible Output

- **Multiple Formats**: Export to Markdown (.md) or Plain Text (.txt)
- **Custom Templates**: Include metadata like file size, line count, modification dates
- **Compact Mode**: Strip extra whitespace for smaller files
- **Clipboard Integration**: Automatically copy to clipboard

### ⚡ Quick Actions

- **Right-click Context Menu**: Export any folder directly from Explorer
- **Command Palette**: `Code Dump: Export Current Workspace`
- **Project Presets**: One-click export for detected project types
- **Dry Run Mode**: Preview what will be exported without creating files

### ✅ Core Features

- ✅ Context menu integration in the Explorer
- ✅ Recursively scans folders and subfolders
- ✅ Filters by extension (e.g. `.ts`, `.js`, `.py`)
- ✅ Exports to `.txt` or Markdown `.md` format
- ✅ Skips files listed in `.gitignore`
- ✅ Supports chunked export (AI-friendly)
- ✅ Custom file name & save location
- ✅ Copies output to clipboard (optional)
- ✅ Automatically opens file after export (optional)
- ✅ Respects `settings.json` config
- ✅ Compact Mode: minifies whitespace for large exports
- ✅ Dry-run mode for automation and CLI usage

---

## 🚀 Usage

### Context Menu (Recommended)

1. **Right-click** on any folder in VSCode Explorer
2. Select **"Export Code to TXT/MD"**
3. Choose extensions and format
4. Done! 🎉

### Command Palette

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type: `Code Dump: Export Current Workspace`
3. Follow the prompts

---

## 🎯 Project Presets

The extension automatically detects your project type and suggests optimal settings:

| Project Type      | Auto-detected Files                              | Included Extensions                                    | Template      |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------ | ------------- |
| **React/Next.js** | `package.json` with React deps                   | `.tsx`, `.ts`, `.jsx`, `.js`, `.css`, `.scss`, `.json` | With Metadata |
| **Vue/Nuxt**      | `package.json` with Vue deps                     | `.vue`, `.js`, `.ts`, `.css`, `.scss`, `.json`         | Compact       |
| **Angular**       | `package.json` with Angular deps                 | `.ts`, `.html`, `.css`, `.scss`, `.json`               | With Metadata |
| **Python**        | `requirements.txt`, `setup.py`, `pyproject.toml` | `.py`, `.pyx`, `.pyi`, `.txt`, `.md`, `.yml`           | With Metadata |
| **Rust**          | `Cargo.toml`                                     | `.rs`, `.toml`, `.md`                                  | With Metadata |
| **Go**            | `go.mod`                                         | `.go`, `.mod`, `.sum`, `.md`                           | Default       |
| **Flutter**       | `pubspec.yaml`                                   | `.dart`, `.yaml`, `.yml`                               | Default       |
| **Node.js**       | `package.json` (generic)                         | `.js`, `.ts`, `.json`, `.md`                           | Default       |

---

## ⚙️ Configuration

### Basic Settings

You can customize the extension behavior in your `settings.json`:

```jsonc
{
  "codeDump.defaultExtensions": [".ts", ".js", ".py"],
  "codeDump.outputFormat": ".md",
  "codeDump.openAfterExport": true,
  "codeDump.copyToClipboard": false,
  "codeDump.compactMode": false,
  "codeDump.dryRun": false,
  "codeDump.skipEmptyFiles": "ask"
}
```

### Smart Filters

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

### Advanced Settings

```json
{
  "codeDump.enablePresets": true,
  "codeDump.showTokenEstimate": true,
  "codeDump.includeMetadata": false,
  "codeDump.useSmartFilters": true,
  "codeDump.maxChunkSize": 500000
}
```

---

## 📋 Templates

### Default Markdown

````markdown
## src/component.tsx

```tsx
export const Component = () => {
  return <div>Hello World</div>;
};
```
````

### With Metadata

````markdown
## src/component.tsx

**Lines:** 3 | **Size:** 156 bytes | **Modified:** 2024-01-15

```tsx
export const Component = () => {
  return <div>Hello World</div>;
};
```
````

### AI-Ready

````markdown
<!-- FILE: src/component.tsx -->
<!-- TOKENS: ~39 -->

```tsx
export const Component = () => {
  return <div>Hello World</div>;
};
```
````

---

## 🎛️ All Settings

| Setting             | Default                 | Description             |
| ------------------- | ----------------------- | ----------------------- |
| `defaultExtensions` | `[".ts", ".js", ".py"]` | Default file extensions |
| `outputFormat`      | `".md"`                 | Default output format   |
| `openAfterExport`   | `true`                  | Open file after export  |
| `copyToClipboard`   | `false`                 | Copy to clipboard       |
| `compactMode`       | `false`                 | Strip extra whitespace  |
| `skipEmptyFiles`    | `"ask"`                 | Handle empty files      |
| `useSmartFilters`   | `true`                  | Enable smart filtering  |
| `enablePresets`     | `true`                  | Enable project presets  |
| `includeMetadata`   | `false`                 | Include file metadata   |
| `showTokenEstimate` | `true`                  | Show token estimates    |

---

## 🔧 Advanced Usage

### Custom Exclude Patterns

Use glob patterns to exclude specific files:

```json
{
  "codeDump.smartFilters": {
    "excludePatterns": ["*.test.js", "**/__tests__/**", "*.spec.ts"]
  }
}
```

### Large Project Optimization

For huge codebases:

```json
{
  "codeDump.maxChunkSize": 1000000,
  "codeDump.compactMode": true,
  "codeDump.smartFilters": {
    "maxFileSize": "500KB"
  }
}
```

---

## 🤖 AI Integration Tips

### Token Optimization

- Use **Compact Mode** to reduce token usage
- Set **maxFileSize** to avoid huge files
- Enable **Token Estimation** to monitor costs

### Best Practices

1. **Use presets** for consistent project exports
2. **Enable metadata** for better AI context
3. **Chunk large exports** for model limits
4. **Exclude test files** for production code analysis

---

## 📊 Export Statistics

After each export, you'll see:

- **Files processed/skipped**
- **Total size and line count**
- **Estimated token count**
- **File type breakdown**
- **Processing time**

---

## 🛠️ Development

```bash
# Clone and setup
git clone https://github.com/m-ghiani/code-exporter.git
cd code-exporter
npm install

# Compile
npm run compile

# Package
npm run package
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙋‍♂️ Contributing

Issues and pull requests welcome! Please check existing issues first.

---

**Made with ❤️ for developers who love clean code exports** 🚀
