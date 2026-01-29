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
exports.prioritizeFiles = prioritizeFiles;
exports.buildOptimizationPipeline = buildOptimizationPipeline;
exports.optimizeContent = optimizeContent;
exports.wouldExceedBudget = wouldExceedBudget;
const path = __importStar(require("path"));
const contextOptimizer_1 = require("./contextOptimizer");
function prioritizeFiles(files, folderUri, getFileStats, prioritizeRecentFiles) {
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
        }
        catch {
            mtime = 0;
        }
        return { file, score, mtime, relativePath };
    });
    return scored
        .sort((a, b) => {
        if (a.score !== b.score)
            return b.score - a.score;
        if (prioritizeRecentFiles && a.mtime !== b.mtime)
            return b.mtime - a.mtime;
        return a.relativePath.localeCompare(b.relativePath);
    })
        .map((item) => item.file);
}
function buildOptimizationPipeline(config, files, folderUri, getFileStats) {
    const useOptimizer = config?.enabled === true;
    const orderedFiles = useOptimizer
        ? prioritizeFiles(files, folderUri, getFileStats, config.prioritizeRecentFiles)
        : files;
    const optimizer = useOptimizer ? new contextOptimizer_1.ContextOptimizer(config) : null;
    const maxTokenBudget = useOptimizer && config.maxTokenBudget > 0
        ? config.maxTokenBudget
        : Number.POSITIVE_INFINITY;
    return { useOptimizer, optimizer, maxTokenBudget, orderedFiles };
}
function optimizeContent(content, filePath, extension, optimizer) {
    const originalTokens = Math.ceil(content.length / 4);
    const optimizedContent = optimizer
        ? optimizer.optimizeContent(content, filePath, extension)
        : content;
    const optimizedTokens = Math.ceil(optimizedContent.length / 4);
    return { optimizedContent, optimizedTokens, originalTokens };
}
function wouldExceedBudget(totalTokens, newTokens, maxTokenBudget) {
    return totalTokens + newTokens > maxTokenBudget;
}
//# sourceMappingURL=exportOptimization.js.map