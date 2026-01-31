import * as vscode from "vscode";
import * as path from "path";
import { ServiceContainerFactory } from "./serviceContainer";
import { ExportPreset } from "./types";
import { showExportWebview } from "./webview";
import {
  buildFileSelectionSummary,
  isNotebooklmUploadAvailable,
  processFiles
} from "./exportWorkflow";

export function activate(context: vscode.ExtensionContext) {
  const services = ServiceContainerFactory.create();
  services.state.setContext(context);
  context.subscriptions.push({ dispose: () => ServiceContainerFactory.dispose() });

  const disposable = vscode.commands.registerCommand(
    "extension.exportCodeToText",
    async (uri?: vscode.Uri) => {
      const folderUri = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      // Refresh config on each export to pick up any changes
      ServiceContainerFactory.refreshConfig();
      const config = services.config.load();

      if (!folderUri) {
        if (config.showNotifications) {
          vscode.window.showErrorMessage("No folder selected.");
        }
        return;
      }

      // Get user selections
      const rawFiles = await services.fileSystem.getAllFiles(folderUri);
      const allExtensions = Array.from(
        new Set(rawFiles.map((f) => path.extname(f)).filter((e) => e))
      ).sort();

      const lastChoices = config.rememberLastChoice ? services.state.getLastChoices() : undefined;
      let presetExtensions: string[] | null = null;
      let presetTemplate: string | null = null;
      if (config.enablePresets) {
        const detectedType = await services.preset.detectProjectType(folderUri);
        if (detectedType) {
          const preset = services.preset.getPreset(detectedType);
          if (preset) {
            presetExtensions = preset.extensions;
            presetTemplate = preset.template;
          }
        }
      }
      const defaultFormat = lastChoices?.outputFormat || config.outputFormat;
      const defaultTemplate = lastChoices?.template
        || presetTemplate
        || (defaultFormat === ".txt" ? "default-txt" : "default-md");
      const defaultFileName = `${path.basename(folderUri)}-code${defaultFormat}`;
      const defaultOutputPath = lastChoices?.outputPath || path.join(folderUri, defaultFileName);

      const profiles = config.userProfiles || [];
      const selectedProfileId = lastChoices?.profileId
        && profiles.some((profile) => profile.id === lastChoices.profileId)
        ? lastChoices.profileId
        : "default";
      const notebooklmAvailable = isNotebooklmUploadAvailable(config);

      const session = await showExportWebview(context, {
        extensions: allExtensions,
        templates: services.template.getTemplateOptions(),
        preselectedExtensions: lastChoices?.extensions?.length
          ? lastChoices.extensions
          : (presetExtensions && presetExtensions.length > 0 ? presetExtensions : config.defaultExtensions),
        selectedTemplate: defaultTemplate,
        exportPreset: lastChoices?.preset || "standard",
        profiles,
        selectedProfileId,
        privacyModeEnabled: config.privacyMode.enabled,
        openAfterExport: lastChoices?.openAfterExport ?? config.openAfterExport,
        notebooklmUploadAvailable: notebooklmAvailable,
        notebooklmUploadEnabled: lastChoices?.notebooklmUpload ?? false,
        skipEmpty: lastChoices?.skipEmpty ?? (config.skipEmptyFiles === "exclude"),
        outputFormat: defaultFormat,
        defaultFileName,
        defaultOutputPath,
        showPreview: config.showPreview !== "never",
        dryRun: config.dryRun
      });
      if (!session) return;
      const userSelections = session.selections;
      const log = session.appendLog;
      log("Selections received.");

      const {
        selectedExtensions,
        skipEmpty,
        outputPath,
        showPreview,
        exportPreset,
        privacyModeEnabled,
        selectedProfileId: profileId,
        openAfterExport,
        notebooklmUploadEnabled
      } = userSelections;
      let { outputFormat } = userSelections;
      let { selectedTemplate } = userSelections;
      if (outputFormat === ".txt" && selectedTemplate === "default-md") selectedTemplate = "default-txt";
      if (outputFormat === ".md" && selectedTemplate === "default-txt") selectedTemplate = "default-md";
      if (outputFormat === ".pdf" && selectedTemplate === "default-txt") selectedTemplate = "default-md";
      if (exportPreset === "ai-pack") {
        selectedTemplate = "ai-ready";
        outputFormat = ".json";
      }

      if (config.rememberLastChoice) {
        await services.state.saveLastChoices({
          extensions: selectedExtensions,
          template: selectedTemplate,
          outputFormat,
          skipEmpty,
          preset: exportPreset,
          profileId,
          outputPath,
          openAfterExport,
          notebooklmUpload: notebooklmUploadEnabled
        });
      }

      // Load ignore files
      await Promise.all([
        services.filter.loadGitignore(folderUri),
        services.filter.loadCodedumpIgnore(folderUri, config.useCodedumpIgnore)
      ]);

      // Show status bar and start scanning
      services.statusBar.show();
      services.statusBar.setScanning();

      // Get and filter files
      const { filteredFiles, excludedFiles } = await buildFileSelectionSummary(
        services,
        rawFiles,
        folderUri,
        selectedExtensions,
        config.useSmartFilters,
        exportPreset
      );
      log(`Files matched: ${filteredFiles.length} (excluded: ${excludedFiles.length}).`);

      // Update status bar with file count
      services.statusBar.setIdle(filteredFiles.length);

      if (filteredFiles.length === 0) {
        services.statusBar.hide();
        log("No files matched the current filters.");
        if (config.showNotifications) {
          vscode.window.showWarningMessage(
            "No files matched the current filters. Check extensions, .gitignore/.codedumpignore, smart filters, or sensitive-file exclusions."
          );
        }
        return;
      }

      if (config.dryRun) {
        log(`Dry run enabled: ${filteredFiles.length} files would be processed.`);
        if (config.showNotifications) {
          vscode.window.showInformationMessage(
            `Dry run enabled: ${filteredFiles.length} files would be processed.`
          );
        }
        services.statusBar.hide();
        return;
      }

      // Show preview if enabled
      let finalFiles = filteredFiles;
      if (showPreview) {
        log("Showing file preview...");
        const previewResult = await showFilePreview(services, folderUri, filteredFiles);
        if (previewResult === null) {
          services.statusBar.hide();
          log("Export cancelled from preview.");
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
        outputPath,
        exportPreset,
        excludedFiles,
        privacyModeEnabled,
        openAfterExport,
        notebooklmUploadEnabled,
        log
      });
    }
  );

  context.subscriptions.push(disposable);

  // CLI command
  const cliDisposable = vscode.commands.registerCommand("extension.exportCodeCLI", async () => {
    const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!folderUri) {
        if (services.config.load().showNotifications) {
          vscode.window.showErrorMessage("No workspace folder found.");
        }
        return;
      }
    await vscode.commands.executeCommand("extension.exportCodeToText", vscode.Uri.file(folderUri));
  });

  context.subscriptions.push(cliDisposable);
}

interface UserSelections {
  selectedExtensions: string[];
  selectedTemplate: string;
  exportPreset: ExportPreset;
  selectedProfileId: string;
  privacyModeEnabled: boolean;
  openAfterExport: boolean;
  notebooklmUploadEnabled: boolean;
  skipEmpty: boolean;
  outputFormat: string;
  outputPath: string;
  showPreview: boolean;
}

async function showFilePreview(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  folderUri: string,
  files: string[]
): Promise<string[] | null> {
  // Calculate stats for preview
  let totalSize = 0;
  const fileItems: Array<{ label: string; description: string; detail: string; picked: boolean; filePath: string }> = [];

  for (const file of files) {
    try {
      const stats = await services.fileSystem.getFileStats(file);
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

  // Show preview with file selection
  const selected = await vscode.window.showQuickPick(fileItems, {
    canPickMany: true,
    title: `Preview: ${files.length} files | ${totalSizeFormatted} | ~${totalTokensFormatted} tokens`,
    placeHolder: "Uncheck files to exclude from export, then press Enter to continue"
  });

  if (!selected) return null;
  if (selected.length === 0) {
    if (services.config.load().showNotifications) {
      vscode.window.showWarningMessage("No files selected for export.");
    }
    return null;
  }

  return selected.map((item) => item.filePath);
}

export function deactivate() {}
