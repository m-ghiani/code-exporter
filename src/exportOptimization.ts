import * as path from "path";
import { AiContextOptimizerConfig } from "./types";
import { ContextOptimizer } from "./contextOptimizer";

export interface FileStatsLike {
  mtime: Date;
}

export type GetFileStats = (filePath: string) => FileStatsLike;

export interface OptimizationPipeline {
  useOptimizer: boolean;
  optimizer: ContextOptimizer | null;
  maxTokenBudget: number;
  orderedFiles: string[];
}

export interface OptimizedContentResult {
  optimizedContent: string;
  optimizedTokens: number;
  originalTokens: number;
}

export function prioritizeFiles(
  files: string[],
  folderUri: string,
  getFileStats: GetFileStats,
  prioritizeRecentFiles: boolean
): string[] {
  const entryBaseNames = new Set([
    "index",
    "main",
    "app",
    "server",
    "cli",
    "bootstrap",
    "startup",
    "init",
    "entry"
  ]);
  const entryFileNames = new Set([
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "next.config.js",
    "next.config.ts",
    "webpack.config.js",
    "webpack.config.ts"
  ]);

  const scored = files.map((file) => {
    const relativePath = path.relative(folderUri, file);
    const ext = path.extname(file);
    const baseName = path.basename(file, ext).toLowerCase();
    const fileName = path.basename(file).toLowerCase();
    const depth = relativePath.split(path.sep).length;
    let score = 0;

    if (entryBaseNames.has(baseName) || entryFileNames.has(fileName)) {
      score += 100;
    }
    if (depth <= 2) {
      score += 10;
    }
    if (relativePath.startsWith(`src${path.sep}`)) {
      score += 5;
    }

    let mtime = 0;
    try {
      mtime = getFileStats(file).mtime.getTime();
    } catch {
      mtime = 0;
    }

    return { file, score, mtime, relativePath };
  });

  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (prioritizeRecentFiles && a.mtime !== b.mtime) return b.mtime - a.mtime;
      return a.relativePath.localeCompare(b.relativePath);
    })
    .map((item) => item.file);
}

export function buildOptimizationPipeline(
  config: AiContextOptimizerConfig,
  files: string[],
  folderUri: string,
  getFileStats: GetFileStats
): OptimizationPipeline {
  const useOptimizer = config?.enabled === true;
  const orderedFiles = useOptimizer
    ? prioritizeFiles(files, folderUri, getFileStats, config.prioritizeRecentFiles)
    : files;
  const optimizer = useOptimizer ? new ContextOptimizer(config) : null;
  const maxTokenBudget = useOptimizer && config.maxTokenBudget > 0
    ? config.maxTokenBudget
    : Number.POSITIVE_INFINITY;

  return { useOptimizer, optimizer, maxTokenBudget, orderedFiles };
}

export function optimizeContent(
  content: string,
  filePath: string,
  extension: string,
  optimizer: ContextOptimizer | null
): OptimizedContentResult {
  const originalTokens = Math.ceil(content.length / 4);
  const optimizedContent = optimizer
    ? optimizer.optimizeContent(content, filePath, extension)
    : content;
  const optimizedTokens = Math.ceil(optimizedContent.length / 4);

  return { optimizedContent, optimizedTokens, originalTokens };
}

export function wouldExceedBudget(
  totalTokens: number,
  newTokens: number,
  maxTokenBudget: number
): boolean {
  return totalTokens + newTokens > maxTokenBudget;
}
