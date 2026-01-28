import * as vscode from "vscode";

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private isExporting: boolean = false;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "extension.exportCodeToText";
    this.statusBarItem.tooltip = "Click to export code";
    this.hide();
  }

  show(): void {
    this.statusBarItem.show();
  }

  hide(): void {
    this.statusBarItem.hide();
  }

  setIdle(fileCount?: number): void {
    this.isExporting = false;
    if (fileCount !== undefined) {
      this.statusBarItem.text = `$(file-code) Code Dump: ${fileCount} files`;
      this.statusBarItem.tooltip = `${fileCount} files ready to export. Click to start.`;
    } else {
      this.statusBarItem.text = "$(file-code) Code Dump";
      this.statusBarItem.tooltip = "Click to export code";
    }
    this.statusBarItem.backgroundColor = undefined;
  }

  setScanning(): void {
    this.isExporting = true;
    this.statusBarItem.text = "$(sync~spin) Scanning files...";
    this.statusBarItem.tooltip = "Scanning directory for files";
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }

  setExporting(current: number, total: number, tokens: number, size: number): void {
    this.isExporting = true;
    const percent = Math.round((current / total) * 100);
    const sizeFormatted = this.formatSize(size);
    const tokensFormatted = this.formatNumber(tokens);

    this.statusBarItem.text = `$(sync~spin) Exporting: ${current}/${total} (${percent}%)`;
    this.statusBarItem.tooltip = `Processing files...\n${tokensFormatted} tokens | ${sizeFormatted}`;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }

  setComplete(files: number, tokens: number, size: number): void {
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

  setError(message: string): void {
    this.isExporting = false;
    this.statusBarItem.text = `$(error) Export failed`;
    this.statusBarItem.tooltip = message;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground"
    );

    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (!this.isExporting) {
        this.hide();
      }
    }, 10000);
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  private formatNumber(num: number): string {
    if (num < 1000) return num.toString();
    if (num < 1000000) return `${(num / 1000).toFixed(1)}k`;
    return `${(num / 1000000).toFixed(2)}M`;
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
