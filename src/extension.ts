import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ServiceContainerFactory } from "./serviceContainer";
import { JsonExportOutput, JsonExportFile } from "./types";

export function activate(context: vscode.ExtensionContext) {
  const services = ServiceContainerFactory.create();
  services.state.setContext(context);
  context.subscriptions.push({ dispose: () => ServiceContainerFactory.dispose() });

  const disposable = vscode.commands.registerCommand(
    "extension.exportCodeToText",
    async (uri?: vscode.Uri) => {
      const folderUri = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!folderUri) {
        vscode.window.showErrorMessage("No folder selected.");
        return;
      }

      // Refresh config on each export to pick up any changes
      ServiceContainerFactory.refreshConfig();
      const config = services.config.load();

      // Get user selections
      const userSelections = await getUserSelections(services, config, folderUri);
      if (!userSelections) return;

      const { selectedExtensions, selectedTemplate, skipEmpty, outputFormat, outputPath } = userSelections;

      // Load ignore files
      services.filter.loadGitignore(folderUri);
      services.filter.loadCodedumpIgnore(folderUri, config.useCodedumpIgnore);

      // Show status bar and start scanning
      services.statusBar.show();
      services.statusBar.setScanning();

      // Get and filter files
      const rawFiles = services.fileSystem.getAllFiles(folderUri);
      const filteredFiles = rawFiles.filter((file) =>
        services.filter.shouldIncludeFile(file, folderUri, selectedExtensions, config.useSmartFilters)
      );

      // Update status bar with file count
      services.statusBar.setIdle(filteredFiles.length);

      if (config.dryRun) {
        vscode.window.showInformationMessage(
          `Dry run enabled: ${filteredFiles.length} files would be processed.`
        );
        services.statusBar.hide();
        return;
      }

      // Show preview if enabled
      let finalFiles = filteredFiles;
      if (config.showPreview !== "never") {
        const previewResult = await showPreview(services, config, folderUri, filteredFiles);
        if (previewResult === null) {
          services.statusBar.hide();
          return; // User cancelled
        }
        finalFiles = previewResult;
      }

      // Process files
      await processFiles(services, config, {
        folderUri,
        filteredFiles: finalFiles,
        selectedTemplate,
        skipEmpty,
        outputFormat,
        outputPath
      });
    }
  );

  context.subscriptions.push(disposable);

  // CLI command
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

interface UserSelections {
  selectedExtensions: string[];
  selectedTemplate: string;
  skipEmpty: boolean;
  outputFormat: string;
  outputPath: string;
}

async function getUserSelections(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  folderUri: string
): Promise<UserSelections | null> {
  let selectedExtensions: string[] = [];
  let selectedTemplate = "default-md";

  // Get last choices if remember is enabled
  const lastChoices = config.rememberLastChoice ? services.state.getLastChoices() : undefined;

  // Detect project type and offer preset
  if (config.enablePresets) {
    const detectedType = services.preset.detectProjectType(folderUri);
    if (detectedType) {
      const preset = services.preset.getPreset(detectedType);
      const usePreset = await vscode.window.showQuickPick(
        ["Use preset: " + preset!.name, "Custom selection"],
        { title: `Detected ${preset!.name} - Use preset?`, placeHolder: "Choose export method" }
      );

      if (usePreset?.startsWith("Use preset")) {
        selectedExtensions = preset!.extensions;
        selectedTemplate = preset!.template;
      }
    }
  }

  // If no preset selected, show extension selection
  if (selectedExtensions.length === 0) {
    const rawFiles = services.fileSystem.getAllFiles(folderUri);
    const allExtensions = Array.from(
      new Set(rawFiles.map((f) => path.extname(f)).filter((e) => e))
    ).sort();

    // Pre-select last used extensions if available
    const extensionItems = allExtensions.map((ext) => ({
      label: ext,
      picked: lastChoices?.extensions?.includes(ext) ?? false
    }));

    const extensionChoice = await vscode.window.showQuickPick(extensionItems, {
      canPickMany: true,
      title: "Select extensions to include in export",
      placeHolder: lastChoices?.extensions?.length
        ? `Last used: ${lastChoices.extensions.join(", ")}`
        : config.defaultExtensions.join(", ")
    });

    if (!extensionChoice || extensionChoice.length === 0) return null;
    selectedExtensions = extensionChoice.map((e) => e.label);
  }

  // Template selection
  if (config.includeMetadata) {
    const templateOptions = services.template.getTemplateNames().map((key) => ({
      label: services.template["templates"].get(key)!.name,
      description: key,
      picked: lastChoices?.template === key
    }));

    const templateChoice = await vscode.window.showQuickPick(templateOptions, {
      title: "Select output template",
      placeHolder: "Choose formatting template"
    });

    if (templateChoice) {
      selectedTemplate = templateChoice.description;
    }
  } else if (lastChoices?.template) {
    selectedTemplate = lastChoices.template;
  }

  // Skip empty files
  let skipEmpty = config.skipEmptyFiles === "exclude";
  if (config.skipEmptyFiles === "ask") {
    const defaultChoice = lastChoices?.skipEmpty !== undefined
      ? (lastChoices.skipEmpty ? "Exclude empty files" : "Include empty files")
      : undefined;

    const userChoice = await vscode.window.showQuickPick(
      ["Include empty files", "Exclude empty files"],
      {
        title: "Include empty files in export?",
        placeHolder: defaultChoice ? `Last: ${defaultChoice}` : "Choose whether to skip or include"
      }
    );
    if (!userChoice) return null;
    skipEmpty = userChoice === "Exclude empty files";
  }

  // Output format - use last choice as default
  const formatItems = [
    { label: ".md", description: "Markdown with code blocks" },
    { label: ".txt", description: "Plain text with separators" },
    { label: ".json", description: "Structured JSON (for programmatic use)" }
  ];
  const defaultFormat = lastChoices?.outputFormat || config.outputFormat;
  // Put last used format first
  if (defaultFormat) {
    formatItems.sort((a, b) => (a.label === defaultFormat ? -1 : b.label === defaultFormat ? 1 : 0));
  }

  const formatChoice = await vscode.window.showQuickPick(formatItems, {
    placeHolder: `Select export format${lastChoices?.outputFormat ? ` (last: ${lastChoices.outputFormat})` : ""}`
  });
  const outputFormat = formatChoice?.label || config.outputFormat;

  // File name
  const defaultFileName = `${path.basename(folderUri)}-code${outputFormat}`;
  const customFileName = await vscode.window.showInputBox({
    prompt: "Enter output file name",
    value: defaultFileName,
    validateInput: (val) =>
      /[<>:"/\\|?*]/.test(val) ? "Filename contains invalid characters." : null
  });

  if (!customFileName) return null;

  // Output location
  const filterName = outputFormat === ".md" ? "Markdown" : outputFormat === ".json" ? "JSON" : "Text";
  const outputUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(folderUri, customFileName)),
    filters: {
      [filterName]: [outputFormat.replace(".", "")]
    }
  });

  if (!outputUri) return null;

  // Save choices for next time if enabled
  if (config.rememberLastChoice) {
    await services.state.saveLastChoices({
      extensions: selectedExtensions,
      template: selectedTemplate,
      outputFormat,
      skipEmpty
    });
  }

  return {
    selectedExtensions,
    selectedTemplate,
    skipEmpty,
    outputFormat,
    outputPath: outputUri.fsPath
  };
}

async function showPreview(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  folderUri: string,
  files: string[]
): Promise<string[] | null> {
  // Calculate stats for preview
  let totalSize = 0;
  const fileItems: Array<{ label: string; description: string; detail: string; picked: boolean; filePath: string }> = [];

  for (const file of files) {
    try {
      const stats = services.fileSystem.getFileStats(file);
      const relativePath = path.relative(folderUri, file);
      const sizeKB = (stats.size / 1024).toFixed(1);
      const tokens = Math.ceil(stats.size / 4);

      totalSize += stats.size;
      fileItems.push({
        label: `$(file) ${path.basename(file)}`,
        description: path.dirname(relativePath) === "." ? "" : path.dirname(relativePath),
        detail: `${sizeKB} KB | ~${tokens} tokens`,
        picked: true,
        filePath: file
      });
    } catch {
      // Skip files that can't be read
    }
  }

  const totalSizeFormatted = totalSize < 1024 * 1024
    ? `${(totalSize / 1024).toFixed(1)} KB`
    : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
  const totalTokens = Math.ceil(totalSize / 4);
  const totalTokensFormatted = totalTokens < 1000
    ? totalTokens.toString()
    : totalTokens < 1000000
      ? `${(totalTokens / 1000).toFixed(1)}k`
      : `${(totalTokens / 1000000).toFixed(2)}M`;

  // If "ask" mode, first ask if user wants to see preview
  if (config.showPreview === "ask") {
    const wantPreview = await vscode.window.showQuickPick(
      [
        { label: "$(eye) Show preview", description: "Review and modify file list before export" },
        { label: "$(play) Export now", description: `Export all ${files.length} files (${totalSizeFormatted}, ~${totalTokensFormatted} tokens)` }
      ],
      {
        title: `Ready to export ${files.length} files`,
        placeHolder: "Choose an option"
      }
    );

    if (!wantPreview) return null;
    if (wantPreview.label.includes("Export now")) return files;
  }

  // Show preview with file selection
  const selected = await vscode.window.showQuickPick(fileItems, {
    canPickMany: true,
    title: `Preview: ${files.length} files | ${totalSizeFormatted} | ~${totalTokensFormatted} tokens`,
    placeHolder: "Uncheck files to exclude from export, then press Enter to continue"
  });

  if (!selected) return null;
  if (selected.length === 0) {
    vscode.window.showWarningMessage("No files selected for export.");
    return null;
  }

  return selected.map((item) => item.filePath);
}

interface ProcessOptions {
  folderUri: string;
  filteredFiles: string[];
  selectedTemplate: string;
  skipEmpty: boolean;
  outputFormat: string;
  outputPath: string;
}

async function processFiles(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  options: ProcessOptions
): Promise<void> {
  const { folderUri, filteredFiles, selectedTemplate, skipEmpty, outputFormat, outputPath } = options;

  // Use different processing for JSON format
  if (outputFormat === ".json") {
    await processFilesAsJson(services, config, options);
    return;
  }

  const managers = ServiceContainerFactory.createExportManagers(
    outputPath,
    outputFormat,
    config.maxChunkSize
  );

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Exporting code...", cancellable: false },
    async (progress) => {
      for (let i = 0; i < filteredFiles.length; i++) {
        const file = filteredFiles[i];
        managers.logger.incrementTotal();

        try {
          let content = services.fileSystem.readFile(file);
          if (config.compactMode) content = content.replace(/\s+/g, " ");
          if (skipEmpty && content.trim().length === 0) {
            managers.logger.recordSkipped(file, "empty");
            continue;
          }

          const relativePath = path.relative(folderUri, file);
          const lines = content.split("\n").length;
          const tokens = Math.ceil(content.length / 4);
          const extension = path.extname(file).replace(".", "");

          const formatted = services.template.formatContent(
            selectedTemplate,
            relativePath,
            content,
            file,
            outputFormat
          );

          managers.chunk.addContent(formatted);
          managers.logger.recordProcessed(content.length, lines, tokens, extension);

          // Update status bar
          const stats = managers.logger.getStats();
          services.statusBar.setExporting(i + 1, filteredFiles.length, stats.estimatedTokens, stats.totalSize);
        } catch (err) {
          managers.logger.recordError(file, err as Error);
        }

        progress.report({
          increment: ((i + 1) / filteredFiles.length) * 100,
          message: `Processing: ${path.basename(file)}`
        });
      }

      const writtenFiles = managers.chunk.finalize();

      // Show completion status
      const finalStats = managers.logger.getStats();
      services.statusBar.setComplete(finalStats.processedFiles, finalStats.estimatedTokens, finalStats.totalSize);

      if (config.copyToClipboard && writtenFiles.length > 0) {
        const clipboardContent = fs.readFileSync(writtenFiles[0], "utf8");
        await vscode.env.clipboard.writeText(clipboardContent);
      }

      // Show result message
      const stats = managers.logger.getStats();
      const message = config.showTokenEstimate
        ? managers.logger.formatSummary()
        : `Code exported to: ${outputPath}\nFiles written: ${stats.processedFiles}, skipped: ${stats.skippedFiles}`;

      const actions = ["Open File"];
      if (stats.errorFiles > 0) actions.push("View Errors");
      if (config.showTokenEstimate) actions.push("View Details");

      const action = config.openAfterExport
        ? await vscode.window.showInformationMessage(message, ...actions)
        : await vscode.window.showInformationMessage(message, ...actions.slice(1));

      if (stats.errorFiles > 0) {
        console.warn("Errors:", stats.errors);
      }

      if (action === "Open File") {
        vscode.window.showTextDocument(vscode.Uri.file(writtenFiles[0]));
      } else if (action === "View Errors") {
        await managers.logger.showDetailedReport();
      } else if (action === "View Details") {
        vscode.window.showInformationMessage(managers.logger.formatDetailedSummary());
      }
    }
  );
}

async function processFilesAsJson(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  options: ProcessOptions
): Promise<void> {
  const { folderUri, filteredFiles, skipEmpty, outputPath } = options;

  const jsonFiles: JsonExportFile[] = [];
  let totalSize = 0;
  let totalLines = 0;
  let totalTokens = 0;
  const extensions = new Set<string>();
  let processedCount = 0;
  let skippedCount = 0;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Exporting to JSON...", cancellable: false },
    async (progress) => {
      for (let i = 0; i < filteredFiles.length; i++) {
        const file = filteredFiles[i];

        try {
          let content = services.fileSystem.readFile(file);
          if (config.compactMode) content = content.replace(/\s+/g, " ");
          if (skipEmpty && content.trim().length === 0) {
            skippedCount++;
            continue;
          }

          const stats = services.fileSystem.getFileStats(file);
          const relativePath = path.relative(folderUri, file);
          const lines = content.split("\n").length;
          const tokens = Math.ceil(content.length / 4);
          const ext = path.extname(file).replace(".", "");

          extensions.add(ext);
          totalSize += content.length;
          totalLines += lines;
          totalTokens += tokens;
          processedCount++;

          jsonFiles.push({
            path: relativePath,
            extension: ext,
            content,
            size: content.length,
            lines,
            tokens,
            modified: stats.mtime.toISOString()
          });

          // Update status bar
          services.statusBar.setExporting(i + 1, filteredFiles.length, totalTokens, totalSize);
        } catch (err) {
          console.warn(`Failed to process ${file}:`, err);
        }

        progress.report({
          increment: ((i + 1) / filteredFiles.length) * 100,
          message: `Processing: ${path.basename(file)}`
        });
      }

      // Build JSON output
      const jsonOutput: JsonExportOutput = {
        metadata: {
          exportedAt: new Date().toISOString(),
          sourceFolder: path.basename(folderUri),
          totalFiles: processedCount,
          totalSize,
          totalLines,
          estimatedTokens: totalTokens,
          extensions: Array.from(extensions).sort(),
          version: "1.0"
        },
        files: jsonFiles
      };

      // Write JSON file
      fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2), "utf8");

      // Show completion status
      services.statusBar.setComplete(processedCount, totalTokens, totalSize);

      if (config.copyToClipboard) {
        await vscode.env.clipboard.writeText(JSON.stringify(jsonOutput, null, 2));
      }

      // Show result message
      const sizeFormatted = totalSize < 1024 * 1024
        ? `${(totalSize / 1024).toFixed(1)} KB`
        : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
      const tokensFormatted = totalTokens < 1000
        ? totalTokens.toString()
        : `${(totalTokens / 1000).toFixed(1)}k`;

      const message = `JSON exported: ${processedCount} files | ${sizeFormatted} | ~${tokensFormatted} tokens`;

      const actions = ["Open File"];
      if (skippedCount > 0) actions.push(`${skippedCount} Skipped`);

      const action = config.openAfterExport
        ? await vscode.window.showInformationMessage(message, ...actions)
        : await vscode.window.showInformationMessage(message);

      if (action === "Open File") {
        vscode.window.showTextDocument(vscode.Uri.file(outputPath));
      }
    }
  );
}

export function deactivate() {}
