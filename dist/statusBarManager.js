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
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
class StatusBarManager {
    statusBarItem;
    isExporting = false;
    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = "extension.exportCodeToText";
        this.statusBarItem.tooltip = "Click to export code";
        this.hide();
    }
    show() {
        this.statusBarItem.show();
    }
    hide() {
        this.statusBarItem.hide();
    }
    setIdle(fileCount) {
        this.isExporting = false;
        if (fileCount !== undefined) {
            this.statusBarItem.text = `$(file-code) Code Dump: ${fileCount} files`;
            this.statusBarItem.tooltip = `${fileCount} files ready to export. Click to start.`;
        }
        else {
            this.statusBarItem.text = "$(file-code) Code Dump";
            this.statusBarItem.tooltip = "Click to export code";
        }
        this.statusBarItem.backgroundColor = undefined;
    }
    setScanning() {
        this.isExporting = true;
        this.statusBarItem.text = "$(sync~spin) Scanning files...";
        this.statusBarItem.tooltip = "Scanning directory for files";
        this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
    setExporting(current, total, tokens, size) {
        this.isExporting = true;
        const percent = Math.round((current / total) * 100);
        const sizeFormatted = this.formatSize(size);
        const tokensFormatted = this.formatNumber(tokens);
        this.statusBarItem.text = `$(sync~spin) Exporting: ${current}/${total} (${percent}%)`;
        this.statusBarItem.tooltip = `Processing files...\n${tokensFormatted} tokens | ${sizeFormatted}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
    setComplete(files, tokens, size) {
        this.isExporting = false;
        const sizeFormatted = this.formatSize(size);
        const tokensFormatted = this.formatNumber(tokens);
        this.statusBarItem.text = `$(check) ${files} files | ${tokensFormatted} tokens | ${sizeFormatted}`;
        this.statusBarItem.tooltip = `Export complete!\n${files} files processed\n${tokensFormatted} estimated tokens\n${sizeFormatted} total size`;
        this.statusBarItem.backgroundColor = undefined;
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (!this.isExporting) {
                this.hide();
            }
        }, 10000);
    }
    setError(message) {
        this.isExporting = false;
        this.statusBarItem.text = `$(error) Export failed`;
        this.statusBarItem.tooltip = message;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (!this.isExporting) {
                this.hide();
            }
        }, 10000);
    }
    formatSize(bytes) {
        if (bytes < 1024)
            return `${bytes} B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    formatNumber(num) {
        if (num < 1000)
            return num.toString();
        if (num < 1000000)
            return `${(num / 1000).toFixed(1)}k`;
        return `${(num / 1000000).toFixed(2)}M`;
    }
    dispose() {
        this.statusBarItem.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBarManager.js.map