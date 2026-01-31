import * as fs from "fs/promises";
import * as https from "https";
import * as path from "path";
import * as vscode from "vscode";
import { ServiceContainerFactory } from "./serviceContainer";
import {
  AiContextSummary,
  ContextSummaryFile,
  ExportConfig,
  ExportPreset,
  JsonExportFile,
  JsonExportOutput,
  PrivacyReport
} from "./types";
import { DependencyAnalyzer } from "./dependencyAnalyzer";
import {
  buildOptimizationPipeline,
  optimizeContent,
  wouldExceedBudget
} from "./exportOptimization";
import { maskContent } from "./privacyMasker";
import { exportMarkdownToPdf } from "./pdfExporter";

const CONCURRENCY_LIMIT = 4;

function shouldNotify(config: ExportConfig): boolean {
  return config.showNotifications;
}

function notifyInfo(config: ExportConfig, message: string, ...actions: string[]): Thenable<string | undefined> {
  if (!shouldNotify(config)) return Promise.resolve(undefined);
  return actions.length > 0
    ? vscode.window.showInformationMessage(message, ...actions)
    : vscode.window.showInformationMessage(message);
}

function notifyWarning(config: ExportConfig, message: string, ...actions: string[]): Thenable<string | undefined> {
  if (!shouldNotify(config)) return Promise.resolve(undefined);
  return actions.length > 0
    ? vscode.window.showWarningMessage(message, ...actions)
    : vscode.window.showWarningMessage(message);
}

function notifyError(config: ExportConfig, message: string): Thenable<string | undefined> {
  if (!shouldNotify(config)) return Promise.resolve(undefined);
  return vscode.window.showErrorMessage(message);
}

function getProgressLocation(config: ExportConfig): vscode.ProgressLocation {
  return shouldNotify(config) ? vscode.ProgressLocation.Notification : vscode.ProgressLocation.Window;
}

function createLoggers(log: ((message: string) => void) | undefined, verbose: boolean) {
  return {
    info: (message: string) => log?.(message),
    verbose: (message: string) => {
      if (verbose) log?.(`VERBOSE: ${message}`);
    }
  };
}

async function runWithConcurrency<T>(
  items: string[],
  limit: number,
  task: (item: string, index: number) => Promise<T>,
  onResult: (result: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const inFlight = new Map<number, Promise<T>>();
  const start = (index: number) => {
    inFlight.set(index, task(items[index], index));
  };
  const initial = Math.min(limit, items.length);
  for (let i = 0; i < initial; i++) start(i);

  for (let i = 0; i < items.length; i++) {
    const current = inFlight.get(i);
    if (!current) continue;
    const result = await current;
    inFlight.delete(i);
    const nextIndex = i + limit;
    if (nextIndex < items.length) start(nextIndex);
    await onResult(result, i);
  }
}

export interface ProcessOptions {
  folderUri: string;
  filteredFiles: string[];
  selectedTemplate: string;
  skipEmpty: boolean;
  outputFormat: string;
  outputPath: string;
  exportPreset: ExportPreset;
  excludedFiles?: ContextSummaryFile[];
  privacyModeEnabled: boolean;
  openAfterExport: boolean;
  notebooklmUploadEnabled: boolean;
  log?: (message: string) => void;
}

export async function buildFileSelectionSummary(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  rawFiles: string[],
  folderUri: string,
  selectedExtensions: string[],
  useSmartFilters: boolean,
  exportPreset: ExportPreset
): Promise<{ filteredFiles: string[]; excludedFiles: ContextSummaryFile[] }> {
  const excludedFiles: ContextSummaryFile[] = [];
  const filteredFiles: string[] = [];

  for (const file of rawFiles) {
    const reason = await services.filter.getExcludeReason(
      file,
      folderUri,
      selectedExtensions,
      useSmartFilters
    );

    if (reason) {
      if (exportPreset === "ai-pack") {
        excludedFiles.push({ path: path.relative(folderUri, file), reason });
      }
      continue;
    }

    filteredFiles.push(file);
  }

  return { filteredFiles, excludedFiles };
}

export async function processFiles(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  options: ProcessOptions
): Promise<void> {
  const {
    folderUri,
    filteredFiles,
    selectedTemplate,
    skipEmpty,
    outputFormat,
    outputPath,
    exportPreset,
    privacyModeEnabled,
    openAfterExport,
    notebooklmUploadEnabled,
    log
  } = options;

  const logger = createLoggers(log, config.logVerbose);

  if (exportPreset === "ai-pack") {
    logger.info("Starting AI Pack export...");
    await processFilesAsAiPack(services, config, options);
    return;
  }

  if (outputFormat === ".pdf") {
    logger.info("Starting PDF export...");
    await processFilesAsPdf(services, config, options);
    return;
  }

  if (outputFormat === ".json") {
    logger.info("Starting JSON export...");
    await processFilesAsJson(services, config, options);
    return;
  }

  const privacyConfig = buildPrivacyConfig(config, privacyModeEnabled);
  const privacyReport = initPrivacyReport(privacyConfig.enabled);

  const optimization = await buildOptimizationPipeline(
    config.aiContextOptimizer,
    filteredFiles,
    folderUri,
    (filePath) => services.fileSystem.getFileStats(filePath)
  );
  let totalOptimizedTokens = 0;

  const managers = ServiceContainerFactory.createExportManagers(
    outputPath,
    outputFormat,
    config.maxChunkSize
  );

  await vscode.window.withProgress(
    { location: getProgressLocation(config), title: "Exporting code...", cancellable: false },
    async (progress) => {
      const orderedFiles = optimization.orderedFiles;
      const totalFiles = orderedFiles.length;
      const limit = Math.min(CONCURRENCY_LIMIT, totalFiles);

      logger.verbose(`Processing ${totalFiles} files with concurrency ${limit}.`);

      await runWithConcurrency(
        orderedFiles,
        limit,
        async (file) => {
          try {
            const [content, stats] = await Promise.all([
              services.fileSystem.readFile(file),
              services.fileSystem.getFileStats(file)
            ]);
            return { ok: true as const, file, content, stats };
          } catch (error) {
            return { ok: false as const, file, error: error as Error };
          }
        },
        async (result, index) => {
          const file = result.file;
          managers.logger.incrementTotal();

          if (!result.ok) {
            managers.logger.recordError(file, result.error);
            logger.info(`Error processing ${file}: ${result.error.message}`);
            return;
          }

          let content = result.content;
          logger.verbose(`Processing file: ${path.relative(folderUri, file)} (${content.length} chars).`);
          if (privacyConfig.enabled) {
            const masked = maskContent(content, privacyConfig);
            content = masked.maskedContent;
            applyPrivacyStats(privacyReport, path.relative(folderUri, file), masked);
          }
          if (config.compactMode) content = content.replace(/\s+/g, " ");
          const relativePath = path.relative(folderUri, file);
          const extension = path.extname(file).replace(".", "");
          const optimizedResult = optimizeContent(content, file, extension, optimization.optimizer);
          const optimizedContent = optimizedResult.optimizedContent;

          if (skipEmpty && optimizedContent.trim().length === 0) {
            logger.info(`Skipped empty file: ${relativePath}`);
            managers.logger.recordSkipped(file, "empty");
            return;
          }

          if (optimization.useOptimizer && wouldExceedBudget(
            totalOptimizedTokens,
            optimizedResult.optimizedTokens,
            optimization.maxTokenBudget
          )) {
            logger.info(`Skipped due to budget: ${relativePath}`);
            managers.logger.recordSkipped(file, "budget");
            return;
          }

          totalOptimizedTokens += optimizedResult.optimizedTokens;
          const lines = optimizedContent.split("\n").length;
          const formatted = services.template.formatContent(
            selectedTemplate,
            relativePath,
            optimizedContent,
            file,
            outputFormat
          );

          await managers.chunk.addContent(formatted);
          managers.logger.recordProcessed(
            optimizedContent.length,
            lines,
            optimizedResult.optimizedTokens,
            extension
          );
          logger.verbose(`Processed file: ${relativePath} (${lines} lines).`);

          const stats = managers.logger.getStats();
          services.statusBar.setExporting(
            index + 1,
            totalFiles,
            stats.estimatedTokens,
            stats.totalSize
          );

          progress.report({
            increment: ((index + 1) / totalFiles) * 100,
            message: `Processing: ${path.basename(file)}`
          });
        }
      );

      logger.verbose(`Finalizing output to ${outputPath}.`);
      const writtenFiles = await managers.chunk.finalize();
      const finalStats = managers.logger.getStats();
      if (writtenFiles.length === 0) {
        services.statusBar.setComplete(finalStats.processedFiles, finalStats.estimatedTokens, finalStats.totalSize);
        logger.info("Export produced no output.");
        await notifyWarning(
          config,
          "Export produced no output. All files were skipped or empty (filters, skip-empty, or token budget)."
        );
        return;
      }

      services.statusBar.setComplete(finalStats.processedFiles, finalStats.estimatedTokens, finalStats.totalSize);

      if (config.copyToClipboard && writtenFiles.length > 0) {
        const clipboardContent = await fs.readFile(writtenFiles[0], "utf8");
        await vscode.env.clipboard.writeText(clipboardContent);
        logger.verbose("Copied output to clipboard.");
      }

      const stats = managers.logger.getStats();
      const message = config.showTokenEstimate
        ? managers.logger.formatSummary()
        : `Code exported to: ${outputPath}\nFiles written: ${stats.processedFiles}, skipped: ${stats.skippedFiles}`;

      const actions = [];
      if (stats.errorFiles > 0) actions.push("View Errors");
      if (config.showTokenEstimate) actions.push("View Details");
      if (privacyReport.enabled && privacyReport.totalMasked > 0) actions.push("View Privacy Report");

      const action = await notifyInfo(config, message, ...actions);

      if (stats.errorFiles > 0) {
        console.warn("Errors:", stats.errors);
      }

      if (openAfterExport && writtenFiles.length > 0) {
        vscode.window.showTextDocument(vscode.Uri.file(writtenFiles[0]));
      }
      if (action === "View Errors") {
        await managers.logger.showDetailedReport(config.showNotifications);
      } else if (action === "View Details") {
        await notifyInfo(config, managers.logger.formatDetailedSummary());
      } else if (action === "View Privacy Report") {
        await openPrivacyReport(privacyReport, "Privacy Report");
      }

      if (notebooklmUploadEnabled) {
        await tryUploadToNotebooklm(outputPath, config, logger.info);
      }
      logger.info("Export completed.");
    }
  );
}

async function processFilesAsJson(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  options: ProcessOptions
): Promise<void> {
  const {
    folderUri,
    filteredFiles,
    skipEmpty,
    outputPath,
    privacyModeEnabled,
    openAfterExport,
    notebooklmUploadEnabled,
    log
  } = options;

  const privacyConfig = buildPrivacyConfig(config, privacyModeEnabled);
  const privacyReport = initPrivacyReport(privacyConfig.enabled);
  const logger = createLoggers(log, config.logVerbose);

  const optimization = await buildOptimizationPipeline(
    config.aiContextOptimizer,
    filteredFiles,
    folderUri,
    (filePath) => services.fileSystem.getFileStats(filePath)
  );

  const jsonFiles: JsonExportFile[] = [];
  let totalSize = 0;
  let totalLines = 0;
  let totalTokens = 0;
  let totalOriginalTokens = 0;
  const extensions = new Set<string>();
  let processedCount = 0;
  let skippedCount = 0;
  const dependencyAnalyzer = config.includeDependencyGraph
    ? new DependencyAnalyzer(folderUri)
    : null;

  await vscode.window.withProgress(
    { location: getProgressLocation(config), title: "Exporting to JSON...", cancellable: false },
    async (progress) => {
      const orderedFiles = optimization.orderedFiles;
      const totalFiles = orderedFiles.length;
      const limit = Math.min(CONCURRENCY_LIMIT, totalFiles);

      logger.verbose(`Processing ${totalFiles} files with concurrency ${limit}.`);

      await runWithConcurrency(
        orderedFiles,
        limit,
        async (file) => {
          try {
            const [content, stats] = await Promise.all([
              services.fileSystem.readFile(file),
              services.fileSystem.getFileStats(file)
            ]);
            return { ok: true as const, file, content, stats };
          } catch (error) {
            return { ok: false as const, file, error: error as Error };
          }
        },
        async (result, index) => {
          const file = result.file;
          if (!result.ok) {
            console.warn(`Failed to process ${file}:`, result.error);
            logger.info(`Error processing ${file}: ${result.error.message}`);
            return;
          }

          let content = result.content;
          logger.verbose(`Processing file: ${path.relative(folderUri, file)} (${content.length} chars).`);
          if (privacyConfig.enabled) {
            const masked = maskContent(content, privacyConfig);
            content = masked.maskedContent;
            applyPrivacyStats(privacyReport, path.relative(folderUri, file), masked);
          }
          if (config.compactMode) content = content.replace(/\s+/g, " ");
          const stats = result.stats;
          const relativePath = path.relative(folderUri, file);
          const ext = path.extname(file).replace(".", "");
          const optimizedResult = optimizeContent(content, file, ext, optimization.optimizer);
          const optimizedContent = optimizedResult.optimizedContent;

          if (skipEmpty && optimizedContent.trim().length === 0) {
            skippedCount++;
            logger.info(`Skipped empty file: ${relativePath}`);
            return;
          }

          if (optimization.useOptimizer && wouldExceedBudget(
            totalTokens,
            optimizedResult.optimizedTokens,
            optimization.maxTokenBudget
          )) {
            skippedCount++;
            logger.info(`Skipped due to budget: ${relativePath}`);
            return;
          }

          const lines = optimizedContent.split("\n").length;

          extensions.add(ext);
          totalSize += optimizedContent.length;
          totalLines += lines;
          totalTokens += optimizedResult.optimizedTokens;
          totalOriginalTokens += optimizedResult.originalTokens;
          processedCount++;
          logger.verbose(`Processed file: ${relativePath} (${lines} lines).`);

          if (dependencyAnalyzer) {
            dependencyAnalyzer.addFile(relativePath, optimizedContent);
          }

          jsonFiles.push({
            path: relativePath,
            extension: ext,
            content: optimizedContent,
            size: optimizedContent.length,
            lines,
            tokens: optimizedResult.optimizedTokens,
            modified: stats.mtime.toISOString()
          });

          services.statusBar.setExporting(
            index + 1,
            totalFiles,
            totalTokens,
            totalSize
          );

          progress.report({
            increment: ((index + 1) / totalFiles) * 100,
            message: `Processing: ${path.basename(file)}`
          });
        }
      );

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

      if (dependencyAnalyzer) {
        const graph = dependencyAnalyzer.analyze();
        const dependencies: Record<string, string[]> = {};

        for (const node of graph.nodes) {
          dependencies[node] = [];
        }

        for (const edge of graph.edges) {
          if (!dependencies[edge.from]) dependencies[edge.from] = [];
          if (!dependencies[edge.from].includes(edge.to)) {
            dependencies[edge.from].push(edge.to);
          }
        }

        for (const node of Object.keys(dependencies)) {
          dependencies[node].sort();
        }

        jsonOutput.metadata.dependencies = dependencies;
        jsonOutput.dependencyGraph = graph;
      }

      if (optimization.useOptimizer && optimization.optimizer) {
        jsonOutput.optimizationStats = optimization.optimizer.getStats(
          totalOriginalTokens,
          totalTokens
        );
      }
      if (privacyReport.enabled) {
        jsonOutput.privacyReport = privacyReport;
      }

      logger.verbose(`Writing JSON output to ${outputPath}.`);
      await fs.writeFile(outputPath, JSON.stringify(jsonOutput, null, 2), "utf8");

      services.statusBar.setComplete(processedCount, totalTokens, totalSize);

      if (config.copyToClipboard) {
        await vscode.env.clipboard.writeText(JSON.stringify(jsonOutput, null, 2));
        logger.verbose("Copied JSON output to clipboard.");
      }

      const sizeFormatted = totalSize < 1024 * 1024
        ? `${(totalSize / 1024).toFixed(1)} KB`
        : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
      const tokensFormatted = totalTokens < 1000
        ? totalTokens.toString()
        : `${(totalTokens / 1000).toFixed(1)}k`;

      const message = `JSON exported: ${processedCount} files | ${sizeFormatted} | ~${tokensFormatted} tokens`;

      const actions = [];
      if (skippedCount > 0) actions.push(`${skippedCount} Skipped`);
      if (privacyReport.enabled && privacyReport.totalMasked > 0) actions.push("View Privacy Report");

      const action = await notifyInfo(config, message, ...actions);

      if (openAfterExport) {
        vscode.window.showTextDocument(vscode.Uri.file(outputPath));
      }
      if (action === "View Privacy Report") {
        await openPrivacyReport(privacyReport, "Privacy Report");
      }

      if (notebooklmUploadEnabled) {
        await tryUploadToNotebooklm(outputPath, config, logger.info);
      }
      logger.info("JSON export completed.");
    }
  );
}

async function processFilesAsPdf(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  options: ProcessOptions
): Promise<void> {
  const {
    folderUri,
    filteredFiles,
    selectedTemplate,
    skipEmpty,
    outputPath,
    privacyModeEnabled,
    openAfterExport,
    notebooklmUploadEnabled,
    log
  } = options;

  const privacyConfig = buildPrivacyConfig(config, privacyModeEnabled);
  const privacyReport = initPrivacyReport(privacyConfig.enabled);
  const logger = createLoggers(log, config.logVerbose);

  const optimization = await buildOptimizationPipeline(
    config.aiContextOptimizer,
    filteredFiles,
    folderUri,
    (filePath) => services.fileSystem.getFileStats(filePath)
  );

  const markdownParts: string[] = [];
  let totalOptimizedTokens = 0;
  let totalSize = 0;
  let totalLines = 0;
  let processedCount = 0;
  let skippedCount = 0;

  await vscode.window.withProgress(
    { location: getProgressLocation(config), title: "Exporting to PDF...", cancellable: false },
    async (progress) => {
      const orderedFiles = optimization.orderedFiles;
      const totalFiles = orderedFiles.length;
      const limit = Math.min(CONCURRENCY_LIMIT, totalFiles);

      logger.verbose(`Processing ${totalFiles} files with concurrency ${limit}.`);

      await runWithConcurrency(
        orderedFiles,
        limit,
        async (file) => {
          try {
            const content = await services.fileSystem.readFile(file);
            return { ok: true as const, file, content };
          } catch (error) {
            return { ok: false as const, file, error: error as Error };
          }
        },
        async (result, index) => {
          const file = result.file;
          if (!result.ok) {
            console.warn(`Failed to process ${file}:`, result.error);
            logger.info(`Error processing ${file}: ${result.error.message}`);
            return;
          }

          let content = result.content;
          logger.verbose(`Processing file: ${path.relative(folderUri, file)} (${content.length} chars).`);
          if (privacyConfig.enabled) {
            const masked = maskContent(content, privacyConfig);
            content = masked.maskedContent;
            applyPrivacyStats(privacyReport, path.relative(folderUri, file), masked);
          }
          if (config.compactMode) content = content.replace(/\s+/g, " ");
          const relativePath = path.relative(folderUri, file);
          const extension = path.extname(file).replace(".", "");
          const optimizedResult = optimizeContent(content, file, extension, optimization.optimizer);
          const optimizedContent = optimizedResult.optimizedContent;

          if (skipEmpty && optimizedContent.trim().length === 0) {
            skippedCount++;
            logger.info(`Skipped empty file: ${relativePath}`);
            return;
          }

          if (optimization.useOptimizer && wouldExceedBudget(
            totalOptimizedTokens,
            optimizedResult.optimizedTokens,
            optimization.maxTokenBudget
          )) {
            skippedCount++;
            logger.info(`Skipped due to budget: ${relativePath}`);
            return;
          }

          totalOptimizedTokens += optimizedResult.optimizedTokens;
          totalSize += optimizedContent.length;
          totalLines += optimizedContent.split("\n").length;
          processedCount++;
          logger.verbose(`Processed file: ${relativePath} (${optimizedContent.split("\n").length} lines).`);

          const formatted = services.template.formatContent(
            selectedTemplate || "default-md",
            relativePath,
            optimizedContent,
            file,
            ".md"
          );
          markdownParts.push(formatted);

          progress.report({
            increment: ((index + 1) / totalFiles) * 100,
            message: `Processing: ${path.basename(file)}`
          });
        }
      );

      const markdownContent = markdownParts.join("");
      if (markdownContent.trim().length === 0) {
        await notifyWarning(
          config,
          "Export produced no output. All files were skipped or empty (filters, skip-empty, or token budget)."
        );
        return;
      }

      logger.verbose(`Writing PDF output to ${outputPath}.`);
      await exportMarkdownToPdf(markdownContent, outputPath);
      logger.info("PDF generated.");

      if (config.copyToClipboard) {
        await vscode.env.clipboard.writeText(markdownContent);
        logger.verbose("Copied PDF source markdown to clipboard.");
      }

      const sizeFormatted = totalSize < 1024 * 1024
        ? `${(totalSize / 1024).toFixed(1)} KB`
        : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
      const tokensFormatted = totalOptimizedTokens < 1000
        ? totalOptimizedTokens.toString()
        : `${(totalOptimizedTokens / 1000).toFixed(1)}k`;

      const message = `PDF exported: ${processedCount} files | ${sizeFormatted} | ~${tokensFormatted} tokens`;
      const actions = [];
      if (skippedCount > 0) actions.push(`${skippedCount} Skipped`);
      if (privacyReport.enabled && privacyReport.totalMasked > 0) actions.push("View Privacy Report");

      const action = await notifyInfo(config, message, ...actions);

      if (openAfterExport) {
        vscode.window.showTextDocument(vscode.Uri.file(outputPath));
      }
      if (action === "View Privacy Report") {
        await openPrivacyReport(privacyReport, "Privacy Report");
      }

      if (notebooklmUploadEnabled) {
        await tryUploadToNotebooklm(outputPath, config, logger.info);
      }
      logger.info("PDF export completed.");
    }
  );
}

async function processFilesAsAiPack(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  options: ProcessOptions
): Promise<void> {
  const {
    folderUri,
    filteredFiles,
    skipEmpty,
    outputPath,
    selectedTemplate,
    excludedFiles,
    privacyModeEnabled,
    openAfterExport,
    notebooklmUploadEnabled,
    log
  } = options;
  const aiConfig = buildAiPackConfig(config);
  const { jsonPath, mdPath } = getAiPackPaths(outputPath);
  const privacyConfig = buildPrivacyConfig(config, privacyModeEnabled);
  const privacyReport = initPrivacyReport(privacyConfig.enabled);
  const logger = createLoggers(log, config.logVerbose);

  const optimization = await buildOptimizationPipeline(
    aiConfig.aiContextOptimizer,
    filteredFiles,
    folderUri,
    (filePath) => services.fileSystem.getFileStats(filePath)
  );

  const jsonFiles: JsonExportFile[] = [];
  const includedFiles: ContextSummaryFile[] = [];
  const excluded: ContextSummaryFile[] = excludedFiles ? [...excludedFiles] : [];
  let totalSize = 0;
  let totalLines = 0;
  let totalTokens = 0;
  let totalOriginalTokens = 0;
  const extensions = new Set<string>();
  let processedCount = 0;
  const dependencyAnalyzer = aiConfig.includeDependencyGraph
    ? new DependencyAnalyzer(folderUri)
    : null;
  const mdEntries: Array<{
    filePath: string;
    relativePath: string;
    extension: string;
    content: string;
  }> = [];

  await vscode.window.withProgress(
    { location: getProgressLocation(config), title: "Exporting AI Pack...", cancellable: false },
    async (progress) => {
      const orderedFiles = optimization.orderedFiles;
      const totalFiles = orderedFiles.length;
      const limit = Math.min(CONCURRENCY_LIMIT, totalFiles);

      logger.verbose(`Processing ${totalFiles} files with concurrency ${limit}.`);

      await runWithConcurrency(
        orderedFiles,
        limit,
        async (file) => {
          try {
            const [content, stats] = await Promise.all([
              services.fileSystem.readFile(file),
              services.fileSystem.getFileStats(file)
            ]);
            return { ok: true as const, file, content, stats };
          } catch (error) {
            return { ok: false as const, file, error: error as Error };
          }
        },
        async (result, index) => {
          const file = result.file;
          if (!result.ok) {
            const relativePath = path.relative(folderUri, file);
            excluded.push({ path: relativePath, reason: "error" });
            logger.info(`Error processing ${relativePath}: ${result.error.message}`);
            return;
          }

          let content = result.content;
          logger.verbose(`Processing file: ${path.relative(folderUri, file)} (${content.length} chars).`);
          if (privacyConfig.enabled) {
            const masked = maskContent(content, privacyConfig);
            content = masked.maskedContent;
            applyPrivacyStats(privacyReport, path.relative(folderUri, file), masked);
          }
          if (aiConfig.compactMode) content = content.replace(/\s+/g, " ");
          const stats = result.stats;
          const relativePath = path.relative(folderUri, file);
          const ext = path.extname(file).replace(".", "");
          const optimizedResult = optimizeContent(content, file, ext, optimization.optimizer);
          const optimizedContent = optimizedResult.optimizedContent;

          if (skipEmpty && optimizedContent.trim().length === 0) {
            excluded.push({ path: relativePath, reason: "empty" });
            logger.info(`Skipped empty file: ${relativePath}`);
            return;
          }

          if (optimization.useOptimizer && wouldExceedBudget(
            totalTokens,
            optimizedResult.optimizedTokens,
            optimization.maxTokenBudget
          )) {
            excluded.push({ path: relativePath, reason: "token-budget" });
            logger.info(`Skipped due to budget: ${relativePath}`);
            return;
          }

          const lines = optimizedContent.split("\n").length;

          extensions.add(ext);
          totalSize += optimizedContent.length;
          totalLines += lines;
          totalTokens += optimizedResult.optimizedTokens;
          totalOriginalTokens += optimizedResult.originalTokens;
          processedCount++;
          logger.verbose(`Processed file: ${relativePath} (${lines} lines).`);

          includedFiles.push({ path: relativePath, reason: "included" });

          if (dependencyAnalyzer) {
            dependencyAnalyzer.addFile(relativePath, optimizedContent);
          }

          jsonFiles.push({
            path: relativePath,
            extension: ext,
            content: optimizedContent,
            size: optimizedContent.length,
            lines,
            tokens: optimizedResult.optimizedTokens,
            modified: stats.mtime.toISOString()
          });
          mdEntries.push({
            filePath: file,
            relativePath,
            extension: ext,
            content: optimizedContent
          });

          services.statusBar.setExporting(
            index + 1,
            totalFiles,
            totalTokens,
            totalSize
          );

          progress.report({
            increment: ((index + 1) / totalFiles) * 100,
            message: `Processing: ${path.basename(file)}`
          });
        }
      );

      const selectionNotes = [
        "Entry points and recent files prioritized",
        "Token budget enforced",
        "Comments removed and whitespace minified",
        "Large files truncated by line limit"
      ];

      const summary: AiContextSummary = {
        preset: "ai-pack",
        formatVersion: "1.0",
        tokenBudget: optimization.maxTokenBudget,
        includedCount: includedFiles.length,
        excludedCount: excluded.length,
        included: includedFiles,
        excluded,
        selectionNotes,
        promptTemplate: ""
      };

      const topFiles = optimization.orderedFiles
        .slice(0, 10)
        .map((file) => path.relative(folderUri, file));
      summary.promptTemplate = buildAiPromptTemplate(
        path.basename(folderUri),
        summary,
        topFiles,
        privacyReport.enabled ? privacyReport : null
      );

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
        files: jsonFiles,
        contextSummary: summary
      };

      if (dependencyAnalyzer) {
        const graph = dependencyAnalyzer.analyze();
        const dependencies: Record<string, string[]> = {};

        for (const node of graph.nodes) {
          dependencies[node] = [];
        }

        for (const edge of graph.edges) {
          if (!dependencies[edge.from]) dependencies[edge.from] = [];
          if (!dependencies[edge.from].includes(edge.to)) {
            dependencies[edge.from].push(edge.to);
          }
        }

        for (const node of Object.keys(dependencies)) {
          dependencies[node].sort();
        }

        jsonOutput.metadata.dependencies = dependencies;
        jsonOutput.dependencyGraph = graph;
      }

      if (optimization.useOptimizer && optimization.optimizer) {
        jsonOutput.optimizationStats = optimization.optimizer.getStats(
          totalOriginalTokens,
          totalTokens
        );
      }
      if (privacyReport.enabled) {
        jsonOutput.privacyReport = privacyReport;
      }

      logger.verbose(`Writing AI Pack JSON to ${jsonPath}.`);
      await fs.writeFile(jsonPath, JSON.stringify(jsonOutput, null, 2), "utf8");

      const managers = ServiceContainerFactory.createExportManagers(
        mdPath,
        ".md",
        aiConfig.maxChunkSize
      );

      const summaryHeader = [
        "# AI Export Pack",
        "",
        "## Context summary",
        `- Included files: ${summary.includedCount}`,
        `- Excluded files: ${summary.excludedCount}`,
        `- Token budget: ${summary.tokenBudget}`,
        privacyReport.enabled ? `- Masked items: ${privacyReport.totalMasked}` : "",
        "",
        "## AI prompt template",
        "```",
        summary.promptTemplate,
        "```",
        "",
        "## Exported files"
      ].join("\n");

      await managers.chunk.addContent(`\n\n${summaryHeader}\n`);
      for (const entry of mdEntries) {
        const formatted = services.template.formatContent(
          selectedTemplate || "ai-ready",
          entry.relativePath,
          entry.content,
          entry.filePath,
          ".md"
        );
        await managers.chunk.addContent(formatted);
      }
      logger.verbose(`Writing AI Pack Markdown to ${mdPath}.`);
      const writtenFiles = await managers.chunk.finalize();

      services.statusBar.setComplete(processedCount, totalTokens, totalSize);

      if (aiConfig.copyToClipboard) {
        await vscode.env.clipboard.writeText(await fs.readFile(jsonPath, "utf8"));
        logger.verbose("Copied AI Pack JSON to clipboard.");
      }

      const sizeFormatted = totalSize < 1024 * 1024
        ? `${(totalSize / 1024).toFixed(1)} KB`
        : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
      const tokensFormatted = totalTokens < 1000
        ? totalTokens.toString()
        : `${(totalTokens / 1000).toFixed(1)}k`;

      const message = `AI Pack exported: ${processedCount} files | ${sizeFormatted} | ~${tokensFormatted} tokens`;
      const actions = [];
      if (privacyReport.enabled && privacyReport.totalMasked > 0) actions.push("View Privacy Report");
      const action = await notifyInfo(config, message, ...actions);

      if (openAfterExport) {
        vscode.window.showTextDocument(vscode.Uri.file(jsonPath));
      }
      if (action === "View Privacy Report") {
        await openPrivacyReport(privacyReport, "Privacy Report");
      }

      if (notebooklmUploadEnabled) {
        await tryUploadToNotebooklm(mdPath, config, logger.info);
      }
      logger.info("AI Pack export completed.");
    }
  );
}

function buildAiPackConfig(config: ExportConfig): ExportConfig {
  return {
    ...config,
    aiContextOptimizer: {
      ...config.aiContextOptimizer,
      enabled: true,
      removeComments: true,
      minifyWhitespace: true,
      truncateLargeFiles: true,
      maxLinesPerFile: Math.min(config.aiContextOptimizer.maxLinesPerFile || 500, 600),
      prioritizeRecentFiles: true
    }
  };
}

function buildAiPromptTemplate(
  projectName: string,
  summary: AiContextSummary,
  topFiles: string[],
  privacyReport: PrivacyReport | null
): string {
  const privacyNote = privacyReport && privacyReport.enabled && privacyReport.totalMasked > 0
    ? "Sensitive data has been masked in this export."
    : "";
  const fileList = topFiles.length > 0 ? topFiles.join("\n") : "(no files)";
  return [
    `You are an AI assistant working on the project "${projectName}".`,
    `Context: ${summary.includedCount} files included, ${summary.excludedCount} excluded.`,
    `Token budget: ${summary.tokenBudget}.`,
    privacyNote ? `Privacy: ${privacyNote}` : "",
    "",
    "Priority files:",
    fileList,
    "",
    "Instructions:",
    "1) Use the provided files as the single source of truth.",
    "2) If anything is missing, ask for the specific file/path.",
    "3) Provide concise, actionable output with code references.",
    "",
    "Task:",
    "- [Describe the task you want the AI to perform]"
  ].join("\n");
}

function getAiPackPaths(outputPath: string): { jsonPath: string; mdPath: string } {
  const ext = path.extname(outputPath);
  const base = ext ? outputPath.slice(0, -ext.length) : outputPath;
  return { jsonPath: `${base}.json`, mdPath: `${base}.md` };
}

function buildPrivacyConfig(config: ExportConfig, enabledOverride: boolean): ExportConfig["privacyMode"] {
  return {
    ...config.privacyMode,
    enabled: enabledOverride
  };
}

function initPrivacyReport(enabled: boolean): PrivacyReport {
  return {
    enabled,
    totalMasked: 0,
    byType: {},
    files: []
  };
}

function applyPrivacyStats(
  report: PrivacyReport,
  relativePath: string,
  maskedResult: { totalMasked: number; byType: Record<string, number> }
): void {
  if (!report.enabled || maskedResult.totalMasked === 0) return;
  report.totalMasked += maskedResult.totalMasked;
  for (const [key, value] of Object.entries(maskedResult.byType)) {
    report.byType[key] = (report.byType[key] || 0) + value;
  }
  report.files.push({ path: relativePath, masked: maskedResult.totalMasked });
}

async function openPrivacyReport(report: PrivacyReport, title: string): Promise<void> {
  if (!report.enabled) return;
  const lines: string[] = [
    `# ${title}`,
    "",
    `Total masked: ${report.totalMasked}`,
    ""
  ];
  if (Object.keys(report.byType).length > 0) {
    lines.push("## By type");
    for (const [key, value] of Object.entries(report.byType)) {
      lines.push(`- ${key}: ${value}`);
    }
    lines.push("");
  }
  if (report.files.length > 0) {
    lines.push("## Files");
    for (const item of report.files.slice(0, 200)) {
      lines.push(`- ${item.path}: ${item.masked}`);
    }
    if (report.files.length > 200) {
      lines.push(`- ...and ${report.files.length - 200} more`);
    }
  }

  const doc = await vscode.workspace.openTextDocument({
    content: lines.join("\n"),
    language: "markdown"
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

export function isNotebooklmUploadAvailable(config: ExportConfig): boolean {
  const enterprise = config.notebooklmEnterprise;
  if (!enterprise || !enterprise.enabled) return false;
  if (!enterprise.projectNumber || !enterprise.location || !enterprise.notebookId) return false;
  return Boolean(getNotebooklmAccessToken(enterprise));
}

function getNotebooklmAccessToken(enterprise: ExportConfig["notebooklmEnterprise"]): string {
  return enterprise.accessToken
    || process.env.NOTEBOOKLM_ACCESS_TOKEN
    || process.env.GOOGLE_OAUTH_ACCESS_TOKEN
    || "";
}

function normalizeEndpointLocation(value: string): string {
  if (!value) return "us-";
  if (value.endsWith("-")) return value;
  return `${value}-`;
}

function getNotebooklmUploadUrl(enterprise: ExportConfig["notebooklmEnterprise"]): string {
  const endpoint = `${normalizeEndpointLocation(enterprise.endpointLocation)}discoveryengine.googleapis.com`;
  const location = enterprise.location || "global";
  return `https://${endpoint}/upload/v1alpha/projects/${enterprise.projectNumber}/locations/${location}/notebooks/${enterprise.notebookId}/sources:uploadFile`;
}

function getNotebooklmContentType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".md") return "text/markdown";
  if (ext === ".txt") return "text/plain";
  return null;
}

async function tryUploadToNotebooklm(
  filePath: string,
  config: ExportConfig,
  log?: (message: string) => void
): Promise<void> {
  if (!isNotebooklmUploadAvailable(config)) {
    await notifyWarning(
      config,
      "NotebookLM upload is not configured. Set codeDump.notebooklmEnterprise settings to enable it."
    );
    log?.("NotebookLM upload skipped: not configured.");
    return;
  }

  const contentType = getNotebooklmContentType(filePath);
  if (!contentType) {
    await notifyWarning(config, "NotebookLM upload supports only .pdf, .md, or .txt files.");
    log?.("NotebookLM upload skipped: unsupported file type.");
    return;
  }

  const enterprise = config.notebooklmEnterprise;
  const accessToken = getNotebooklmAccessToken(enterprise);
  const uploadUrl = getNotebooklmUploadUrl(enterprise);
  const fileName = path.basename(filePath);
  const fileBuffer = await fs.readFile(filePath);
  log?.(`Uploading ${fileName} to NotebookLM...`);

  try {
    await vscode.window.withProgress(
      { location: getProgressLocation(config), title: "Uploading to NotebookLM...", cancellable: false },
      async () => {
        const result = await new Promise<{ name?: string }>((resolve, reject) => {
          const req = https.request(
            uploadUrl,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "X-Goog-Upload-File-Name": fileName,
                "X-Goog-Upload-Protocol": "raw",
                "Content-Type": contentType,
                "Content-Length": fileBuffer.length
              }
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                  try {
                    resolve(JSON.parse(data));
                  } catch {
                    resolve({});
                  }
                } else {
                  reject(new Error(data || `Upload failed (${res.statusCode})`));
                }
              });
            }
          );
          req.on("error", reject);
          req.write(fileBuffer);
          req.end();
        });

        if (result.name) {
          await notifyInfo(config, `NotebookLM upload completed: ${result.name}`);
          log?.(`NotebookLM upload completed: ${result.name}`);
        } else {
          await notifyInfo(config, "NotebookLM upload completed.");
          log?.("NotebookLM upload completed.");
        }
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await notifyError(config, `NotebookLM upload failed: ${message}`);
    log?.(`NotebookLM upload failed: ${message}`);
  }
}
