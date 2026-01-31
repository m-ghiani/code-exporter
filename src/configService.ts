import * as vscode from "vscode";
import {
  AiContextOptimizerConfig,
  ExportConfig,
  IConfigService,
  NotebookLmEnterpriseConfig,
  PrivacyModeConfig,
  SmartFilters,
  UserProfile
} from "./types";

const DEFAULT_SMART_FILTERS: SmartFilters = {
  autoExclude: ["node_modules", "dist", "build", ".git", "coverage", ".vscode", ".idea"],
  maxFileSize: "1MB",
  skipBinaryFiles: true,
  includePatterns: [],
  excludePatterns: ["*.log", "*.tmp", "*.cache"]
};

const DEFAULT_SENSITIVE_PATTERNS: string[] = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.crt",
  "*.cer",
  "credentials.*",
  "*secret*",
  "*.secrets",
  ".npmrc",
  ".pypirc",
  "*.keystore",
  "id_rsa*",
  "id_dsa*",
  "id_ecdsa*",
  "id_ed25519*",
  "*.gpg",
  "serviceAccountKey.json",
  "firebase-adminsdk*.json"
];

const DEFAULT_AI_CONTEXT_OPTIMIZER: AiContextOptimizerConfig = {
  enabled: false,
  maxTokenBudget: 100000,
  removeComments: true,
  removeDocstrings: true,
  minifyWhitespace: true,
  truncateLargeFiles: true,
  maxLinesPerFile: 500,
  prioritizeRecentFiles: true
};

const DEFAULT_PRIVACY_MODE: PrivacyModeConfig = {
  enabled: false,
  maskEmails: true,
  maskTokens: true,
  maskApiKeys: true,
  placeholder: "[REDACTED]",
  customPatterns: []
};

const DEFAULT_NOTEBOOKLM_ENTERPRISE: NotebookLmEnterpriseConfig = {
  enabled: false,
  projectNumber: "",
  location: "global",
  endpointLocation: "us-",
  notebookId: "",
  accessToken: ""
};

export class ConfigService implements IConfigService {
  private config: vscode.WorkspaceConfiguration;

  constructor() {
    this.config = vscode.workspace.getConfiguration("codeDump");
  }

  load(): ExportConfig {
    return {
      defaultExtensions: this.config.get<string[]>("defaultExtensions", [".ts", ".js", ".py"]),
      outputFormat: this.config.get<string>("outputFormat", ".md"),
      openAfterExport: this.config.get<boolean>("openAfterExport", true),
      copyToClipboard: this.config.get<boolean>("copyToClipboard", false),
      showNotifications: this.config.get<boolean>("showNotifications", false),
      logVerbose: this.config.get<boolean>("logVerbose", false),
      compactMode: this.config.get<boolean>("compactMode", false),
      dryRun: this.config.get<boolean>("dryRun", false),
      skipEmptyFiles: this.config.get<"include" | "exclude" | "ask">("skipEmptyFiles", "ask"),
      useSmartFilters: this.config.get<boolean>("useSmartFilters", true),
      useCodedumpIgnore: this.config.get<boolean>("useCodedumpIgnore", true),
      enablePresets: this.config.get<boolean>("enablePresets", true),
      includeMetadata: this.config.get<boolean>("includeMetadata", false),
      showTokenEstimate: this.config.get<boolean>("showTokenEstimate", true),
      smartFilters: this.getSmartFilters(),
      maxChunkSize: this.config.get<number>("maxChunkSize", 500000),
      excludeSensitiveFiles: this.config.get<boolean>("excludeSensitiveFiles", true),
      sensitivePatterns: this.config.get<string[]>("sensitivePatterns", DEFAULT_SENSITIVE_PATTERNS),
      rememberLastChoice: this.config.get<boolean>("rememberLastChoice", true),
      showPreview: this.config.get<"always" | "never" | "ask">("showPreview", "ask"),
      aiContextOptimizer: this.config.get<AiContextOptimizerConfig>(
        "aiContextOptimizer",
        DEFAULT_AI_CONTEXT_OPTIMIZER
      ),
      includeDependencyGraph: this.config.get<boolean>("includeDependencyGraph", true),
      privacyMode: this.config.get<PrivacyModeConfig>("privacyMode", DEFAULT_PRIVACY_MODE),
      userProfiles: this.config.get<UserProfile[]>("userProfiles", []),
      notebooklmEnterprise: this.config.get<NotebookLmEnterpriseConfig>(
        "notebooklmEnterprise",
        DEFAULT_NOTEBOOKLM_ENTERPRISE
      )
    };
  }

  getSmartFilters(): SmartFilters {
    return this.config.get<SmartFilters>("smartFilters", DEFAULT_SMART_FILTERS);
  }
}
