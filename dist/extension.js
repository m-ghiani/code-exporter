"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const serviceContainer_1 = require("./serviceContainer");
const webview_1 = require("./webview");
const profileManagerWebview_1 = require("./profileManagerWebview");
const exportWorkflow_1 = require("./exportWorkflow");
function activate(context) {
    const services = serviceContainer_1.ServiceContainerFactory.create();
    services.state.setContext(context);
    context.subscriptions.push({ dispose: () => serviceContainer_1.ServiceContainerFactory.dispose() });
    const disposable = vscode.commands.registerCommand("extension.exportCodeToText", async (uri) => {
        const folderUri = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        // Refresh config on each export to pick up any changes
        serviceContainer_1.ServiceContainerFactory.refreshConfig();
        const config = services.config.load();
        if (!folderUri) {
            if (config.showNotifications) {
                vscode.window.showErrorMessage("No folder selected.");
            }
            return;
        }
        // Get user selections
        const rawFiles = await services.fileSystem.getAllFiles(folderUri);
        const allExtensions = Array.from(new Set(rawFiles.map((f) => path.extname(f)).filter((e) => e))).sort();
        const lastChoices = config.rememberLastChoice ? services.state.getLastChoices() : undefined;
        let presetExtensions = null;
        let presetTemplate = null;
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
        const notebooklmAvailable = (0, exportWorkflow_1.isNotebooklmUploadAvailable)(config);
        const session = await (0, webview_1.showExportWebview)(context, {
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
        if (!session)
            return;
        const userSelections = session.selections;
        const log = session.appendLog;
        log("Selections received.");
        const { selectedExtensions, skipEmpty, outputPath, showPreview, exportPreset, privacyModeEnabled, selectedProfileId: profileId, openAfterExport, notebooklmUploadEnabled } = userSelections;
        let { outputFormat } = userSelections;
        let { selectedTemplate } = userSelections;
        if (outputFormat === ".txt" && selectedTemplate === "default-md")
            selectedTemplate = "default-txt";
        if (outputFormat === ".md" && selectedTemplate === "default-txt")
            selectedTemplate = "default-md";
        if (outputFormat === ".pdf" && selectedTemplate === "default-txt")
            selectedTemplate = "default-md";
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
        const { filteredFiles, excludedFiles } = await (0, exportWorkflow_1.buildFileSelectionSummary)(services, rawFiles, folderUri, selectedExtensions, config.useSmartFilters, exportPreset);
        log(`Files matched: ${filteredFiles.length} (excluded: ${excludedFiles.length}).`);
        // Update status bar with file count
        services.statusBar.setIdle(filteredFiles.length);
        if (filteredFiles.length === 0) {
            services.statusBar.hide();
            log("No files matched the current filters.");
            if (config.showNotifications) {
                vscode.window.showWarningMessage("No files matched the current filters. Check extensions, .gitignore/.codedumpignore, smart filters, or sensitive-file exclusions.");
            }
            return;
        }
        if (config.dryRun) {
            log(`Dry run enabled: ${filteredFiles.length} files would be processed.`);
            if (config.showNotifications) {
                vscode.window.showInformationMessage(`Dry run enabled: ${filteredFiles.length} files would be processed.`);
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
        await (0, exportWorkflow_1.processFiles)(services, config, {
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
    });
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
    const profileDisposable = vscode.commands.registerCommand("extension.manageProfiles", async () => {
        serviceContainer_1.ServiceContainerFactory.refreshConfig();
        await (0, profileManagerWebview_1.showProfileManagerWebview)(context, {
            profiles: services.config.load().userProfiles || [],
            templates: services.template.getTemplateOptions()
        });
    });
    context.subscriptions.push(cliDisposable);
    context.subscriptions.push(profileDisposable);
}
async function showFilePreview(services, folderUri, files) {
    // Calculate stats for preview
    let totalSize = 0;
    const fileItems = [];
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
        }
        catch {
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
    if (!selected)
        return null;
    if (selected.length === 0) {
        if (services.config.load().showNotifications) {
            vscode.window.showWarningMessage("No files selected for export.");
        }
        return null;
    }
    return selected.map((item) => item.filePath);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map