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
export type ExportPreset = "standard" | "ai-pack";

export interface PrivacyModeConfig {
  enabled: boolean;
  maskEmails: boolean;
  maskTokens: boolean;
  maskApiKeys: boolean;
  placeholder: string;
  customPatterns: string[];
}

export interface NotebookLmEnterpriseConfig {
  enabled: boolean;
  projectNumber: string;
  location: string;
  endpointLocation: string;
  notebookId: string;
  accessToken: string;
}

export interface UserProfile {
  id: string;
  name: string;
  extensions?: string[];
  template?: string;
  outputFormat?: string;
  skipEmpty?: boolean;
  showPreview?: boolean;
  exportPreset?: ExportPreset;
  privacyModeEnabled?: boolean;
}

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
  removeDocstrings: boolean;
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
  showNotifications: boolean;
  logVerbose: boolean;
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
  privacyMode: PrivacyModeConfig;
  userProfiles: UserProfile[];
  notebooklmEnterprise: NotebookLmEnterpriseConfig;
}

// Last user choices for "remember last choice" feature
export interface LastExportChoices {
  extensions?: string[];
  template?: string;
  outputFormat?: string;
  skipEmpty?: boolean;
  preset?: ExportPreset;
  profileId?: string;
  outputPath?: string;
  openAfterExport?: boolean;
  notebooklmUpload?: boolean;
}

// Service interfaces for dependency injection
export interface IFileSystemService {
  getAllFiles(dir: string): Promise<string[]>;
  readFile(filePath: string): Promise<string>;
  fileExists(filePath: string): Promise<boolean>;
  getFileStats(filePath: string): Promise<{ size: number; mtime: Date }>;
}

export interface IConfigService {
  load(): ExportConfig;
  getSmartFilters(): SmartFilters;
}

export interface IFilterService {
  loadGitignore(folderUri: string): Promise<void>;
  loadCodedumpIgnore(folderUri: string, enabled: boolean): Promise<void>;
  shouldIncludeFile(
    filePath: string,
    basePath: string,
    extensions: string[],
    useSmartFilters: boolean
  ): Promise<boolean>;
  getExcludeReason(
    filePath: string,
    basePath: string,
    extensions: string[],
    useSmartFilters: boolean
  ): Promise<string | null>;
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

export interface ContextSummaryFile {
  path: string;
  reason: string;
}

export interface AiContextSummary {
  preset: ExportPreset;
  formatVersion: string;
  tokenBudget: number;
  includedCount: number;
  excludedCount: number;
  included: ContextSummaryFile[];
  excluded: ContextSummaryFile[];
  selectionNotes: string[];
  promptTemplate: string;
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
  contextSummary?: AiContextSummary;
  privacyReport?: PrivacyReport;
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
  docstringsRemoved: number;
}

export interface PrivacyReportFile {
  path: string;
  masked: number;
}

export interface PrivacyReport {
  enabled: boolean;
  totalMasked: number;
  byType: Record<string, number>;
  files: PrivacyReportFile[];
}
