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
exports.ExportLogger = void 0;
const vscode = __importStar(require("vscode"));
class ExportLogger {
    stats = {
        totalFiles: 0,
        processedFiles: 0,
        skippedFiles: 0,
        emptyFiles: 0,
        errorFiles: 0,
        totalSize: 0,
        totalLines: 0,
        estimatedTokens: 0,
        errors: [],
        skippedReasons: [],
        fileTypes: {}
    };
    incrementTotal() {
        this.stats.totalFiles++;
    }
    recordProcessed(fileSize, lines, tokens, extension) {
        this.stats.processedFiles++;
        this.stats.totalSize += fileSize;
        this.stats.totalLines += lines;
        this.stats.estimatedTokens += tokens;
        const ext = extension || 'unknown';
        this.stats.fileTypes[ext] = (this.stats.fileTypes[ext] || 0) + 1;
    }
    recordSkipped(file, reason) {
        this.stats.skippedFiles++;
        if (reason === 'empty')
            this.stats.emptyFiles++;
        if (reason === 'error')
            this.stats.errorFiles++;
        this.stats.skippedReasons.push({ file, reason });
    }
    recordError(file, error) {
        this.stats.errorFiles++;
        this.stats.errors.push({
            file,
            error: error.message
        });
    }
    recordDryRun(fileCount) {
        this.stats.totalFiles = fileCount;
    }
    getStats() {
        return { ...this.stats };
    }
    formatSummary() {
        const { totalFiles, processedFiles, skippedFiles, totalSize, totalLines, estimatedTokens } = this.stats;
        const sizeKB = Math.round(totalSize / 1024);
        return `Export completed: ${processedFiles}/${totalFiles} files processed, ` +
            `${skippedFiles} skipped, ${sizeKB}KB total, ${totalLines} lines, ~${estimatedTokens} tokens`;
    }
    formatDetailedSummary() {
        const summary = this.formatSummary();
        const fileTypesList = Object.entries(this.stats.fileTypes)
            .map(([ext, count]) => `${ext}: ${count}`)
            .join(', ');
        return `${summary}\nFile types: ${fileTypesList}`;
    }
    async showDetailedReport(showNotifications = true) {
        if (!showNotifications)
            return;
        if (this.stats.errors.length > 0) {
            const showErrors = await vscode.window.showWarningMessage(`${this.stats.errorFiles} files had errors. View details?`, 'View Errors', 'View Summary');
            if (showErrors === 'View Errors') {
                const errorList = this.stats.errors
                    .map(e => `${e.file}: ${e.error}`)
                    .join('\n');
                vscode.window.showErrorMessage(`Errors:\n${errorList}`);
            }
            else if (showErrors === 'View Summary') {
                vscode.window.showInformationMessage(this.formatDetailedSummary());
            }
        }
    }
}
exports.ExportLogger = ExportLogger;
//# sourceMappingURL=exportLogger.js.map