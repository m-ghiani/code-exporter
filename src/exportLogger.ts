import * as vscode from "vscode";
import { ExportStatistics } from "./types";

export class ExportLogger {
  private stats: ExportStatistics = {
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

  incrementTotal(): void {
    this.stats.totalFiles++;
  }

  recordProcessed(fileSize: number, lines: number, tokens: number, extension: string): void {
    this.stats.processedFiles++;
    this.stats.totalSize += fileSize;
    this.stats.totalLines += lines;
    this.stats.estimatedTokens += tokens;
    
    const ext = extension || 'unknown';
    this.stats.fileTypes[ext] = (this.stats.fileTypes[ext] || 0) + 1;
  }

  recordSkipped(
    file: string,
    reason: "empty" | "error" | "gitignore" | "size" | "binary" | "budget"
  ): void {
    this.stats.skippedFiles++;
    if (reason === 'empty') this.stats.emptyFiles++;
    if (reason === 'error') this.stats.errorFiles++;
    
    this.stats.skippedReasons.push({ file, reason });
  }

  recordError(file: string, error: Error): void {
    this.stats.errorFiles++;
    this.stats.errors.push({ 
      file, 
      error: error.message 
    });
  }

  recordDryRun(fileCount: number): void {
    this.stats.totalFiles = fileCount;
  }

  getStats(): ExportStatistics {
    return { ...this.stats };
  }

  formatSummary(): string {
    const { totalFiles, processedFiles, skippedFiles, totalSize, totalLines, estimatedTokens } = this.stats;
    const sizeKB = Math.round(totalSize / 1024);
    
    return `Export completed: ${processedFiles}/${totalFiles} files processed, ` +
           `${skippedFiles} skipped, ${sizeKB}KB total, ${totalLines} lines, ~${estimatedTokens} tokens`;
  }

  formatDetailedSummary(): string {
    const summary = this.formatSummary();
    const fileTypesList = Object.entries(this.stats.fileTypes)
      .map(([ext, count]) => `${ext}: ${count}`)
      .join(', ');
    
    return `${summary}\nFile types: ${fileTypesList}`;
  }

  async showDetailedReport(): Promise<void> {
    if (this.stats.errors.length > 0) {
      const showErrors = await vscode.window.showWarningMessage(
        `${this.stats.errorFiles} files had errors. View details?`,
        'View Errors', 'View Summary'
      );
      
      if (showErrors === 'View Errors') {
        const errorList = this.stats.errors
          .map(e => `${e.file}: ${e.error}`)
          .join('\n');
        
        vscode.window.showErrorMessage(`Errors:\n${errorList}`);
      } else if (showErrors === 'View Summary') {
        vscode.window.showInformationMessage(this.formatDetailedSummary());
      }
    }
  }
}
