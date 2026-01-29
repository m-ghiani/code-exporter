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
export type ShowPreviewOption = "always" | "never" | "ask";

export interface SmartFilters {
  autoExclude: string[];
  maxFileSize: string;
  skipBinaryFiles: boolean;
  includePatterns: string[];
  excludePatterns: string[];
}

// AI Context Optimizer settings
export interface AiContextOptimizerConfig {
  enabled: boolean;
  maxTokenBudget: number;
  removeComments: boolean;
  minifyWhitespace: boolean;
  truncateLargeFiles: boolean;
  maxLinesPerFile: number;
  prioritizeRecentFiles: boolean;
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

// Configuration interface
export interface ExportConfig {
  defaultExtensions: string[];
  outputFormat: string;
  openAfterExport: boolean;
  copyToClipboard: boolean;
  compactMode: boolean;
  dryRun: boolean;
  skipEmptyFiles: SkipEmptyOption;
  useSmartFilters: boolean;
  useCodedumpIgnore: boolean;
  enablePresets: boolean;
  includeMetadata: boolean;
  showTokenEstimate: boolean;
  smartFilters: SmartFilters;
  maxChunkSize: number;
  excludeSensitiveFiles: boolean;
  sensitivePatterns: string[];
  rememberLastChoice: boolean;
  showPreview: ShowPreviewOption;
  aiContextOptimizer: AiContextOptimizerConfig;
  includeDependencyGraph: boolean;
}

// Last user choices for "remember last choice" feature
export interface LastExportChoices {
  extensions?: string[];
  template?: string;
  outputFormat?: string;
  skipEmpty?: boolean;
}

// Service interfaces for dependency injection
export interface IFileSystemService {
  getAllFiles(dir: string): string[];
  readFile(filePath: string): string;
  fileExists(filePath: string): boolean;
  getFileStats(filePath: string): { size: number; mtime: Date };
}

export interface IConfigService {
  load(): ExportConfig;
  getSmartFilters(): SmartFilters;
}

export interface IFilterService {
  loadGitignore(folderUri: string): void;
  loadCodedumpIgnore(folderUri: string, enabled: boolean): void;
  shouldIncludeFile(
    filePath: string,
    basePath: string,
    extensions: string[],
    useSmartFilters: boolean
  ): boolean;
}

// Service container for dependency injection
export interface IServiceContainer {
  fileSystem: IFileSystemService;
  config: IConfigService;
  filter: IFilterService;
}

// JSON structured output format
export interface JsonExportMetadata {
  exportedAt: string;
  sourceFolder: string;
  totalFiles: number;
  totalSize: number;
  totalLines: number;
  estimatedTokens: number;
  extensions: string[];
  version: string;
  dependencies?: Record<string, string[]>;
}

export interface JsonExportFile {
  path: string;
  extension: string;
  content: string;
  size: number;
  lines: number;
  tokens: number;
  modified: string;
}

export interface JsonExportOutput {
  metadata: JsonExportMetadata;
  files: JsonExportFile[];
  dependencyGraph?: DependencyGraph;
  optimizationStats?: OptimizationStats;
}

// Dependency graph for understanding file relationships
export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: "import" | "require" | "dynamic";
}

// Stats about AI context optimization
export interface OptimizationStats {
  originalTokens: number;
  optimizedTokens: number;
  tokensSaved: number;
  savingsPercent: number;
  truncatedFiles: string[];
  commentsRemoved: number;
}
