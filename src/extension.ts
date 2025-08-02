import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
import { ChunkManager } from './chunkManager';
import { ExportLogger } from './exportLogger';
import { SmartFilterManager } from './smartFilters';
import { TemplateManager } from './templateManager';
import { ProjectPresetManager } from './projectPresets';
import { SkipEmptyOption, SmartFilters } from './types';

const MAX_CHUNK_SIZE = 500000; // ~500 KB per chunk

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "extension.exportCodeToText",
    async (uri?: vscode.Uri) => {
      const folderUri =
        uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!folderUri) {
        vscode.window.showErrorMessage("No folder selected.");
        return;
      }

      const config = vscode.workspace.getConfiguration("codeDump");
      const defaultExtensions = config.get<string[]>("defaultExtensions", [".ts", ".js", ".py"]);
      const outputFormatDefault = config.get<string>("outputFormat", ".md");
      const openAfterExport = config.get<boolean>("openAfterExport", true);
      const copyToClipboard = config.get<boolean>("copyToClipboard", false);
      const compactMode = config.get<boolean>("compactMode", false);
      const dryRun = config.get<boolean>("dryRun", false);
      const skipEmptySetting = config.get<SkipEmptyOption>("skipEmptyFiles", "ask");
      const useSmartFilters = config.get<boolean>("useSmartFilters", true);
      const enablePresets = config.get<boolean>("enablePresets", true);
      const includeMetadata = config.get<boolean>("includeMetadata", false);
      const showTokenEstimate = config.get<boolean>("showTokenEstimate", true);

      // Initialize managers
      const templateManager = new TemplateManager();
      const presetManager = new ProjectPresetManager();
      
      // Smart filters configuration
      const smartFiltersConfig: SmartFilters = config.get("smartFilters", {
        autoExclude: ["node_modules", "dist", "build", ".git", "coverage", ".vscode", ".idea"],
        maxFileSize: "1MB",
        skipBinaryFiles: true,
        includePatterns: [],
        excludePatterns: ["*.log", "*.tmp", "*.cache"]
      });
      
      const smartFilterManager = new SmartFilterManager(smartFiltersConfig);

      // Detect project type and offer preset
      let selectedExtensions: string[] = [];
      let selectedTemplate = "default-md";
      
      if (enablePresets) {
        const detectedType = presetManager.detectProjectType(folderUri);
        if (detectedType) {
          const preset = presetManager.getPreset(detectedType);
          const usePreset = await vscode.window.showQuickPick(
            ["Use preset: " + preset!.name, "Custom selection"],
            {
              title: `Detected ${preset!.name} - Use preset?`,
              placeHolder: "Choose export method"
            }
          );
          
          if (usePreset?.startsWith("Use preset")) {
            selectedExtensions = preset!.extensions;
            selectedTemplate = preset!.template;
          }
        }
      }

      // If no preset selected, show normal extension selection
      if (selectedExtensions.length === 0) {
        const rawFiles = getAllFiles(folderUri);
        const allExtensions = Array.from(
          new Set(rawFiles.map((f) => path.extname(f)).filter((e) => e))
        ).sort();

        const extensionChoice = await vscode.window.showQuickPick(allExtensions, {
          canPickMany: true,
          title: "Select extensions to include in export",
          placeHolder: defaultExtensions.join(", ")
        });

        if (!extensionChoice || extensionChoice.length === 0) return;
        selectedExtensions = extensionChoice;
      }

      // Template selection
      if (includeMetadata) {
        const templateOptions = templateManager.getTemplateNames().map(key => ({
          label: templateManager['templates'].get(key)!.name,
          description: key
        }));
        
        const templateChoice = await vscode.window.showQuickPick(templateOptions, {
          title: "Select output template",
          placeHolder: "Choose formatting template"
        });
        
        if (templateChoice) {
          selectedTemplate = templateChoice.description;
        }
      }

      let skipEmptyFinal: boolean = false;
      if (skipEmptySetting === "ask") {
        const userChoice = await vscode.window.showQuickPick(
          ["Include empty files", "Exclude empty files"],
          {
            title: "Include empty files in export?",
            placeHolder: "Choose whether to skip or include empty files"
          }
        );
        if (!userChoice) return;
        skipEmptyFinal = userChoice === "Exclude empty files";
      } else {
        skipEmptyFinal = skipEmptySetting === "exclude";
      }

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

      const rawFiles = getAllFiles(folderUri);
      const filteredFiles = rawFiles.filter((file) => {
        const relative = path.relative(folderUri, file);
        
        // Basic filters
        if (!selectedExtensions.includes(path.extname(file))) return false;
        if (!ig.ignores(relative)) {
          // Smart filters (only if not ignored by git)
          if (useSmartFilters && smartFilterManager.shouldExcludeFile(file, folderUri)) {
            return false;
          }
        } else {
          return false;
        }
        
        return true;
      });

      // Enhanced managers
      const logger = new ExportLogger();
      const chunkManager = new ChunkManager(outputPath, outputFormat, MAX_CHUNK_SIZE);

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
          logger.incrementTotal();
          
          try {
            let content = fs.readFileSync(file, "utf8");
            if (compactMode) content = content.replace(/\s+/g, " ");
            if (skipEmptyFinal && content.trim().length === 0) {
              logger.recordSkipped(file, 'empty');
              continue;
            }

            const relativePath = path.relative(folderUri, file);
            const lines = content.split('\n').length;
            const tokens = Math.ceil(content.length / 4); // Rough estimate
            const extension = path.extname(file).replace(".", "");

            // Use template manager for formatting
            const formatted = templateManager.formatContent(
              selectedTemplate,
              relativePath,
              content,
              file,
              outputFormat
            );

            chunkManager.addContent(formatted);
            logger.recordProcessed(content.length, lines, tokens, extension);
          } catch (err) {
            logger.recordError(file, err as Error);
          }
          
          progress.report({ 
            increment: ((i + 1) / filteredFiles.length) * 100,
            message: `Processing: ${path.basename(file)}`
          });
        }

        const writtenFiles = chunkManager.finalize();

        if (copyToClipboard && writtenFiles.length > 0) {
          const clipboardContent = fs.readFileSync(writtenFiles[0], "utf8");
          await vscode.env.clipboard.writeText(clipboardContent);
        }

        const stats = logger.getStats();
        let message = showTokenEstimate ? 
          logger.formatSummary() : 
          `Code exported to: ${outputPath}\nFiles written: ${stats.processedFiles}, skipped: ${stats.skippedFiles}`;

        const actions = ["Open File"];
        if (stats.errorFiles > 0) actions.push("View Errors");
        if (showTokenEstimate) actions.push("View Details");

        const action = openAfterExport
          ? await vscode.window.showInformationMessage(message, ...actions)
          : await vscode.window.showInformationMessage(message, ...actions.slice(1));

        if (stats.errorFiles > 0) {
          console.warn("Errors:", stats.errors);
        }

        if (action === "Open File") {
          vscode.window.showTextDocument(vscode.Uri.file(writtenFiles[0]));
        } else if (action === "View Errors") {
          await logger.showDetailedReport();
        } else if (action === "View Details") {
          vscode.window.showInformationMessage(logger.formatDetailedSummary());
        }
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

function getAllFiles(dir: string): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    const files = entries
      .filter((file) => !file.isDirectory())
      .map((file) => path.join(dir, file.name));

    const folders = entries.filter((folder) => folder.isDirectory());

    for (const folder of folders) {
      try {
        files.push(...getAllFiles(path.join(dir, folder.name)));
      } catch (error) {
        console.warn(`Failed to read directory ${folder.name}:`, error);
      }
    }

    return files;
  } catch (error) {
    console.warn(`Failed to read directory ${dir}:`, error);
    return [];
  }
}

export function deactivate() {}