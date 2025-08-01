import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";

const MAX_CHUNK_SIZE = 500000; // ~500 KB per chunk

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "extension.exportCodeToText",
    async (uri: vscode.Uri) => {
      const folderUri =
        uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!folderUri) {
        vscode.window.showErrorMessage("No folder selected.");
        return;
      }

      const config = vscode.workspace.getConfiguration("codeToTxtExporter");
      const defaultExtensions = config.get<string[]>("defaultExtensions", [".ts", ".js", ".py"]);
      const outputFormatDefault = config.get<string>("outputFormat", ".md");
      const openAfterExport = config.get<boolean>("openAfterExport", true);
      const copyToClipboard = config.get<boolean>("copyToClipboard", false);
      const compactMode = config.get<boolean>("compactMode", false);
      const dryRun = config.get<boolean>("dryRun", false);

      const rawFiles = getAllFiles(folderUri);
      const allExtensions = Array.from(
        new Set(rawFiles.map((f) => path.extname(f)).filter((e) => e))
      ).sort();

      const selectedExtensions = await vscode.window.showQuickPick(allExtensions, {
        canPickMany: true,
        title: "Select extensions to include in export",
        placeHolder: defaultExtensions.join(", ")
      });

      if (!selectedExtensions || selectedExtensions.length === 0) return;

      const outputFormat = await vscode.window.showQuickPick([".txt", ".md"], {
        placeHolder: "Select export format"
      }) || outputFormatDefault;

      const defaultFileName = `${path.basename(folderUri)}-code${outputFormat}`;
      const customFileName = await vscode.window.showInputBox({
        prompt: "Enter output file name",
        value: defaultFileName,
        validateInput: (val) => /[<>:"/\\|?*]/.test(val) ? "Filename contains invalid characters." : null
      });

      if (!customFileName) return;

      const outputUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(folderUri, customFileName)),
        filters: {
          [outputFormat === ".md" ? "Markdown" : "Text"]: [outputFormat.replace(".", "")]
        }
      });

      if (!outputUri) return;

      const outputPath = outputUri.fsPath;

      const gitignorePath = path.join(folderUri, ".gitignore");
      let ig = ignore();
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
        ig = ignore().add(gitignoreContent);
      }

      const filteredFiles = rawFiles.filter((file) => {
        const relative = path.relative(folderUri, file);
        return (
          selectedExtensions.includes(path.extname(file)) &&
          !ig.ignores(relative)
        );
      });

      let chunkIndex = 0;
      let buffer = "";
      let writtenFiles = 0;
      let skippedFiles = 0;

      if (dryRun) {
        vscode.window.showInformationMessage(`Dry run enabled: ${filteredFiles.length} files would be processed.`);
        return;
      }

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Exporting code...",
        cancellable: false
      }, async (progress) => {
        for (let i = 0; i < filteredFiles.length; i++) {
          const file = filteredFiles[i];
          try {
            let content = fs.readFileSync(file, "utf8");
            if (compactMode) content = content.replace(/\s+/g, " ");
            const relativePath = path.relative(folderUri, file);

            const formatted = outputFormat === ".md"
              ? `\n\n## ${relativePath}\n\n\`\`\`${path.extname(file).replace(".", "")}\n${content}\n\`\`\``
              : `\n\n================ ${relativePath} ================\n\n${content}`;

            if ((buffer.length + formatted.length) > MAX_CHUNK_SIZE) {
              const chunkPath = outputPath.replace(outputFormat, `-part${++chunkIndex}${outputFormat}`);
              fs.writeFileSync(chunkPath, buffer, "utf8");
              buffer = "";
            }

            buffer += formatted;
            writtenFiles++;
          } catch (err) {
            skippedFiles++;
          }
          progress.report({ increment: ((i + 1) / filteredFiles.length) * 100 });
        }

        if (buffer.length > 0) {
          const finalPath = chunkIndex > 0
            ? outputPath.replace(outputFormat, `-part${++chunkIndex}${outputFormat}`)
            : outputPath;
          fs.writeFileSync(finalPath, buffer, "utf8");
        }
      });

      if (copyToClipboard) {
        const clipboardContent = fs.readFileSync(outputPath.replace(outputFormat, chunkIndex > 0 ? `-part1${outputFormat}` : outputFormat), "utf8");
        await vscode.env.clipboard.writeText(clipboardContent);
      }

      const action = openAfterExport
        ? await vscode.window.showInformationMessage(
            `Code exported to: ${outputPath}\nFiles written: ${writtenFiles}, skipped: ${skippedFiles}`,
            "Open File"
          )
        : await vscode.window.showInformationMessage(
            `Code exported to: ${outputPath}\nFiles written: ${writtenFiles}, skipped: ${skippedFiles}`
          );

      if (action === "Open File") {
        vscode.window.showTextDocument(vscode.Uri.file(outputPath));
      }
    }
  );

  context.subscriptions.push(disposable);

  // CLI-like command for automation
  const cliDisposable = vscode.commands.registerCommand("extension.exportCodeCLI", async () => {
    const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folderUri) {
      vscode.window.showErrorMessage("No workspace folder found.");
      return;
    }
    await vscode.commands.executeCommand("extension.exportCodeToText", vscode.Uri.file(folderUri));
  });

  context.subscriptions.push(cliDisposable);
}

function getAllFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  const files = entries
    .filter((file) => !file.isDirectory())
    .map((file) => path.join(dir, file.name));

  const folders = entries.filter((folder) => folder.isDirectory());

  for (const folder of folders) {
    files.push(...getAllFiles(path.join(dir, folder.name)));
  }

  return files;
}

export function deactivate() {}
