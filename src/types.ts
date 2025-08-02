export interface ExportStatistics {
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  emptyFiles: number;
  errorFiles: number;
  totalSize: number;
  totalLines: number;
  estimatedTokens: number;
  errors: Array<{ file: string; error: string }>;
  skippedReasons: Array<{ file: string; reason: string }>;
  fileTypes: Record<string, number>;
}

export type SkipEmptyOption = "include" | "exclude" | "ask";

export interface SmartFilters {
  autoExclude: string[];
  maxFileSize: string;
  skipBinaryFiles: boolean;
  includePatterns: string[];
  excludePatterns: string[];
}

export interface ExportTemplate {
  name: string;
  pattern: string;
  withMetadata: boolean;
}

export interface ProjectPreset {
  name: string;
  extensions: string[];
  excludePaths: string[];
  template: string;
}

export interface ExportOptions {
  folderUri: string;
  selectedExtensions: string[];
  outputFormat: string;
  outputPath: string;
  skipEmpty: boolean;
  compactMode: boolean;
  preset?: string;
  template?: string;
  maxFileSize?: number;
  includeMetadata?: boolean;
  tokenEstimate?: boolean;
}