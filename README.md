<p align="center">
  <img src="https://raw.githubusercontent.com/m-ghiani/code-to-txt-exporter/main/logo.png" width="160" alt="Code Exporter Logo"/>
</p>
# Code to TXT Exporter VSCode Extension

A Visual Studio Code extension that allows you to export all source code files from a selected folder (and its subfolders) into one or more `.txt` or `.md` files. You can filter by file extensions, respect `.gitignore`, customize output formatting, and optionally copy the result to clipboard or open it after export.

---

## ✨ Features

- ✅ Context menu integration in the Explorer
- ✅ Recursively scans the selected folder
- ✅ Filters file types by extension (customizable)
- ✅ Exports to `.txt` or Markdown `.md` format
- ✅ Uses `.gitignore` to skip unwanted files
- ✅ Automatically chunks large exports
- ✅ Allows custom output file name and location
- ✅ Copies content to clipboard (optional)
- ✅ Opens exported file after creation (optional)
- ✅ Full support for workspace/user settings

---

## 🚀 Usage

1. Right-click on a folder in the Explorer
2. Choose `Export Code to TXT`
3. Select file extensions to include
4. Choose `.txt` or `.md` format
5. Optionally edit the filename and export location
6. File is saved, opened, and/or copied depending on settings

---

## ⚙️ Configuration (settings.json)

```jsonc
{
  "codeToTxtExporter.defaultExtensions": [".ts", ".js", ".py"],
  "codeToTxtExporter.outputFormat": ".md",
  "codeToTxtExporter.openAfterExport": true,
  "codeToTxtExporter.copyToClipboard": false
}
```

---

## 📦 Project Structure

- `src/extension.ts` – Main logic of the extension
- `package.json` – Configuration and command registration
- `tsconfig.json` – TypeScript configuration
- `.vscode/launch.json` – Debugging setup

---

## 📤 Ideal for...

- Archiving project snapshots
- Sending code to AI tools (e.g., ChatGPT, Claude, Copilot)
- Sharing code context with collaborators
- Creating printable versions of source files

---

MIT License © [mghiani](https://github.com/m-ghiani)

Stai visualizzando una versione precedente
Ripristina questa versione per apportare le modifiche

Ripristina questa versione

Torna all'ultima versione
