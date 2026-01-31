

## aliasResolver.ts

```ts
import * as fs from "fs";
import * as path from "path";

type AliasEntry = {
  key: string;
  prefix: string;
  suffix: string;
  hasWildcard: boolean;
  targets: string[];
};

type AliasResolverOptions = {
  basePath: string;
  configPath?: string;
};

export class AliasResolver {
  private basePath: string;
  private baseUrl: string;
  private aliases: AliasEntry[];

  constructor(options: AliasResolverOptions) {
    this.basePath = options.basePath;
    const config = this.loadConfig(options.configPath);
    this.baseUrl = config.baseUrl;
    this.aliases = config.aliases;
  }

  resolve(importPath: string): string | null {
    for (const alias of this.aliases) {
      if (alias.hasWildcard) {
        if (importPath.startsWith(alias.prefix) && importPath.endsWith(alias.suffix)) {
          const matched = importPath.slice(alias.prefix.length, importPath.length - alias.suffix.length);
          for (const target of alias.targets) {
            const resolvedTarget = target.replace("*", matched);
            const resolvedPath = this.toRelativePath(resolvedTarget);
            if (resolvedPath) return resolvedPath;
          }
        }
      } else if (importPath === alias.key) {
        for (const target of alias.targets) {
          const resolvedPath = this.toRelativePath(target);
          if (resolvedPath) return resolvedPath;
        }
      }
    }

    return null;
  }

  isAliasImport(importPath: string): boolean {
    for (const alias of this.aliases) {
      if (alias.hasWildcard) {
        if (importPath.startsWith(alias.prefix) && importPath.endsWith(alias.suffix)) return true;
      } else if (importPath === alias.key) {
        return true;
      }
    }
    return false;
  }

  getAliasPrefixes(): string[] {
    return this.aliases.map((alias) => alias.prefix).filter((prefix) => prefix.length > 0);
  }

  private loadConfig(explicitPath?: string): { baseUrl: string; aliases: AliasEntry[] } {
    const configPath = explicitPath
      ? explicitPath
      : this.findConfigPath(["tsconfig.json", "jsconfig.json"]);

    if (!configPath) {
      return { baseUrl: ".", aliases: [] };
    }

    let config: unknown;
    try {
      const raw = fs.readFileSync(configPath, "utf8");
      config = JSON.parse(this.stripJsonComments(raw));
    } catch {
      return { baseUrl: ".", aliases: [] };
    }

    const compilerOptions = (config as { compilerOptions?: Record<string, unknown> }).compilerOptions || {};
    const baseUrl = typeof compilerOptions.baseUrl === "string" && compilerOptions.baseUrl.length > 0
      ? compilerOptions.baseUrl
      : ".";
    const paths = compilerOptions.paths as Record<string, string[]> | undefined;
    if (!paths) return { baseUrl, aliases: [] };

    const aliases: AliasEntry[] = [];
    for (const [key, targets] of Object.entries(paths)) {
      if (!Array.isArray(targets) || targets.length === 0) continue;
      const starIndex = key.indexOf("*");
      const hasWildcard = starIndex !== -1;
      const prefix = hasWildcard ? key.slice(0, starIndex) : key;
      const suffix = hasWildcard ? key.slice(starIndex + 1) : "";

      aliases.push({
        key,
        prefix,
        suffix,
        hasWildcard,
        targets
      });
    }

    return { baseUrl, aliases };
  }

  private findConfigPath(fileNames: string[]): string | null {
    for (const name of fileNames) {
      const candidate = path.join(this.basePath, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  private toRelativePath(target: string): string | null {
    const absolute = path.normalize(path.join(this.basePath, this.baseUrl, target));
    const relative = path.relative(this.basePath, absolute);
    if (relative.startsWith("..")) return null;
    return relative;
  }

  private stripJsonComments(content: string): string {
    let result = "";
    let inString = false;
    let stringChar = "";
    let i = 0;

    while (i < content.length) {
      const char = content[i];
      const next = content[i + 1];

      if (inString) {
        result += char;
        if (char === "\\" && next) {
          result += next;
          i += 2;
          continue;
        }
        if (char === stringChar) {
          inString = false;
          stringChar = "";
        }
        i += 1;
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        result += char;
        i += 1;
        continue;
      }

      if (char === "/" && next === "/") {
        i += 2;
        while (i < content.length && content[i] !== "\n") {
          i += 1;
        }
        continue;
      }

      if (char === "/" && next === "*") {
        i += 2;
        while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) {
          i += 1;
        }
        i += 2;
        continue;
      }

      result += char;
      i += 1;
    }

    return result;
  }
}

```

## chunkManager.ts

```ts
import * as fs from "fs/promises";

export class ChunkManager {
  private chunkIndex = 0;
  private buffer = "";
  private readonly maxChunkSize: number;
  private readonly outputPath: string;
  private readonly outputFormat: string;
  private writtenFiles: string[] = [];

  constructor(outputPath: string, outputFormat: string, maxChunkSize = 500000) {
    this.outputPath = outputPath;
    this.outputFormat = outputFormat;
    this.maxChunkSize = maxChunkSize;
  }

  async addContent(content: string): Promise<void> {
    if ((this.buffer.length + content.length) > this.maxChunkSize && this.buffer.length > 0) {
      await this.writeCurrentChunk();
    }
    this.buffer += content;
  }

  private async writeCurrentChunk(): Promise<void> {
    const chunkPath = this.getChunkPath();
    await fs.writeFile(chunkPath, this.buffer, "utf8");
    this.writtenFiles.push(chunkPath);
    this.buffer = "";
    this.chunkIndex++;
  }

  private getChunkPath(): string {
    if (this.chunkIndex === 0) return this.outputPath;
    const basePath = this.outputPath.replace(this.outputFormat, "");
    return `${basePath}-part${this.chunkIndex + 1}${this.outputFormat}`;
  }

  async finalize(): Promise<string[]> {
    if (this.buffer.length > 0) {
      const finalPath = this.getChunkPath();
      await fs.writeFile(finalPath, this.buffer, "utf8");
      this.writtenFiles.push(finalPath);
      this.buffer = "";
    }

    return [...this.writtenFiles];
  }

  getChunkCount(): number {
    return this.chunkIndex + (this.buffer.length > 0 ? 1 : 0);
  }
}

```

## configService.ts

```ts
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

```

## contextOptimizer.ts

```ts
import { AiContextOptimizerConfig, OptimizationStats } from "./types";

type CommentMode = "remove" | "preserve" | null;

type CStyleCommentOptions = {
  preserveDocstrings: boolean;
  removeBlockComments: boolean;
  removeLineComments: boolean;
};

type HashCommentOptions = {
  allowShebang: boolean;
};

export class ContextOptimizer {
  private config: AiContextOptimizerConfig;
  private commentsRemoved = 0;
  private docstringsRemoved = 0;
  private truncatedFiles: string[] = [];

  constructor(config: AiContextOptimizerConfig) {
    this.config = config;
  }

  optimizeContent(content: string, filePath: string, extension: string): string {
    if (!this.config.enabled) {
      return content;
    }

    let optimized = content;

    if (this.config.removeDocstrings) {
      optimized = this.removeDocstrings(optimized, extension);
    }

    // Remove comments based on file extension
    if (this.config.removeComments) {
      optimized = this.removeComments(optimized, extension, !this.config.removeDocstrings);
    }

    // Minify whitespace
    if (this.config.minifyWhitespace) {
      optimized = this.minifyWhitespace(optimized);
    }

    // Truncate large files
    if (this.config.truncateLargeFiles) {
      const lines = optimized.split("\n");
      if (lines.length > this.config.maxLinesPerFile) {
        optimized = lines.slice(0, this.config.maxLinesPerFile).join("\n");
        optimized += `\n\n// ... truncated (${lines.length - this.config.maxLinesPerFile} lines omitted) ...`;
        this.truncatedFiles.push(filePath);
      }
    }

    return optimized;
  }

  private removeComments(content: string, extension: string, preserveDocstrings: boolean): string {
    const originalLength = content.length;
    let result = content;

    switch (extension) {
      case "js":
      case "ts":
      case "jsx":
      case "tsx":
      case "java":
      case "c":
      case "cpp":
      case "cs":
      case "go":
      case "rs":
      case "swift":
      case "kt":
        result = this.stripCStyleComments(result, {
          preserveDocstrings,
          removeBlockComments: true,
          removeLineComments: true
        });
        break;

      case "py":
        result = this.stripHashComments(result, { allowShebang: true });
        break;

      case "rb":
        result = this.stripHashComments(result, { allowShebang: false });
        break;

      case "html":
      case "xml":
        result = result.replace(/<!--[\s\S]*?-->/g, "");
        break;

      case "vue":
      case "svelte":
        result = result.replace(/<!--[\s\S]*?-->/g, "");
        result = this.stripCStyleComments(result, {
          preserveDocstrings,
          removeBlockComments: true,
          removeLineComments: true
        });
        break;

      case "css":
      case "scss":
      case "less":
        result = this.stripCStyleComments(result, {
          preserveDocstrings: false,
          removeBlockComments: true,
          removeLineComments: false
        });
        break;

      case "sql":
        result = this.stripSqlComments(result);
        break;

      case "sh":
      case "bash":
      case "zsh":
        result = this.stripHashComments(result, { allowShebang: true });
        break;
    }

    const charsRemoved = originalLength - result.length;
    if (charsRemoved > 0) {
      this.commentsRemoved += Math.ceil(charsRemoved / 50);
    }

    return result;
  }

  private removeDocstrings(content: string, extension: string): string {
    const originalLength = content.length;
    let result = content;
    let removedCount = 0;

    switch (extension) {
      case "py": {
        const moduleDocstring = /^\s*("""|''')[\s\S]*?\1\s*\n?/;
        const functionDocstring = /(^\s*(def|class)\s+[\w_]+[^\n]*:\s*\n)(\s*)("""|''')[\s\S]*?\4/gm;

        const moduleMatch = result.match(moduleDocstring);
        if (moduleMatch) removedCount += 1;
        result = result.replace(moduleDocstring, "");

        const funcMatches = result.match(functionDocstring);
        if (funcMatches) removedCount += funcMatches.length;
        result = result.replace(functionDocstring, "$1");
        break;
      }

      case "js":
      case "ts":
      case "jsx":
      case "tsx":
      case "java":
      case "c":
      case "cpp":
      case "cs":
      case "rs":
      case "swift":
      case "kt":
        ({ result, removedCount } = this.stripCStyleDocComments(result));
        break;

      case "go":
        result = this.stripGoDocComments(result, (count) => {
          removedCount += count;
        });
        break;

      case "vue":
      case "svelte":
        ({ result, removedCount } = this.stripCStyleDocComments(result));
        break;
    }

    const charsRemoved = originalLength - result.length;
    if (charsRemoved > 0) {
      this.docstringsRemoved += Math.max(removedCount, Math.ceil(charsRemoved / 80));
    }

    return result;
  }

  private stripCStyleComments(content: string, options: CStyleCommentOptions): string {
    let result = "";
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let blockMode: CommentMode = null;
    let lineMode: CommentMode = null;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const next = content[i + 1];

      if (lineMode) {
        if (char === "\n") {
          lineMode = null;
          result += char;
        } else if (lineMode === "preserve") {
          result += char;
        }
        continue;
      }

      if (blockMode) {
        if (char === "*" && next === "/") {
          if (blockMode === "preserve") {
            result += "*/";
          }
          blockMode = null;
          i++;
        } else if (blockMode === "preserve") {
          result += char;
        }
        continue;
      }

      if (inSingle) {
        result += char;
        if (char === "\\" && next) {
          result += next;
          i++;
          continue;
        }
        if (char === "'") inSingle = false;
        continue;
      }

      if (inDouble) {
        result += char;
        if (char === "\\" && next) {
          result += next;
          i++;
          continue;
        }
        if (char === '"') inDouble = false;
        continue;
      }

      if (inTemplate) {
        result += char;
        if (char === "\\" && next) {
          result += next;
          i++;
          continue;
        }
        if (char === "`") inTemplate = false;
        continue;
      }

      if (char === "'") {
        inSingle = true;
        result += char;
        continue;
      }
      if (char === '"') {
        inDouble = true;
        result += char;
        continue;
      }
      if (char === "`") {
        inTemplate = true;
        result += char;
        continue;
      }

      if (char === "/" && next === "/" && options.removeLineComments) {
        const isDoc = content[i + 2] === "/" || content[i + 2] === "!";
        if (isDoc && options.preserveDocstrings) {
          lineMode = "preserve";
          result += "//";
        } else {
          lineMode = "remove";
        }
        i++;
        continue;
      }

      if (char === "/" && next === "*" && options.removeBlockComments) {
        const isDoc = content[i + 2] === "*" || content[i + 2] === "!";
        if (isDoc && options.preserveDocstrings) {
          blockMode = "preserve";
          result += "/*";
        } else {
          blockMode = "remove";
        }
        i++;
        continue;
      }

      result += char;
    }

    return result;
  }

  private stripCStyleDocComments(content: string): { result: string; removedCount: number } {
    let result = "";
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let blockMode: CommentMode = null;
    let lineMode: CommentMode = null;
    let removedCount = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const next = content[i + 1];

      if (lineMode) {
        if (char === "\n") {
          lineMode = null;
          result += char;
        } else if (lineMode === "preserve") {
          result += char;
        }
        continue;
      }

      if (blockMode) {
        if (char === "*" && next === "/") {
          if (blockMode === "preserve") {
            result += "*/";
          }
          blockMode = null;
          i++;
        } else if (blockMode === "preserve") {
          result += char;
        }
        continue;
      }

      if (inSingle) {
        result += char;
        if (char === "\\" && next) {
          result += next;
          i++;
          continue;
        }
        if (char === "'") inSingle = false;
        continue;
      }

      if (inDouble) {
        result += char;
        if (char === "\\" && next) {
          result += next;
          i++;
          continue;
        }
        if (char === '"') inDouble = false;
        continue;
      }

      if (inTemplate) {
        result += char;
        if (char === "\\" && next) {
          result += next;
          i++;
          continue;
        }
        if (char === "`") inTemplate = false;
        continue;
      }

      if (char === "'") {
        inSingle = true;
        result += char;
        continue;
      }
      if (char === '"') {
        inDouble = true;
        result += char;
        continue;
      }
      if (char === "`") {
        inTemplate = true;
        result += char;
        continue;
      }

      if (char === "/" && next === "/") {
        const isDoc = content[i + 2] === "/" || content[i + 2] === "!";
        if (isDoc) {
          lineMode = "remove";
          removedCount += 1;
        } else {
          lineMode = "preserve";
          result += "//";
        }
        i++;
        continue;
      }

      if (char === "/" && next === "*") {
        const isDoc = content[i + 2] === "*" || content[i + 2] === "!";
        if (isDoc) {
          blockMode = "remove";
          removedCount += 1;
        } else {
          blockMode = "preserve";
          result += "/*";
        }
        i++;
        continue;
      }

      result += char;
    }

    return { result, removedCount };
  }

  private stripHashComments(content: string, options: HashCommentOptions): string {
    let result = "";
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inTripleSingle = false;
    let inTripleDouble = false;
    let lineStart = true;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const next = content[i + 1];
      const nextTwo = content[i + 2];

      if (char === "\n") {
        lineStart = true;
      } else if (char.trim().length > 0) {
        lineStart = false;
      }

      if (inTripleSingle) {
        result += char;
        if (char === "'" && next === "'" && nextTwo === "'") {
          result += "''";
          i += 2;
          inTripleSingle = false;
        }
        continue;
      }

      if (inTripleDouble) {
        result += char;
        if (char === '"' && next === '"' && nextTwo === '"') {
          result += '""';
          i += 2;
          inTripleDouble = false;
        }
        continue;
      }

      if (inSingle) {
        result += char;
        if (char === "\\" && next) {
          result += next;
          i++;
          continue;
        }
        if (char === "'") inSingle = false;
        continue;
      }

      if (inDouble) {
        result += char;
        if (char === "\\" && next) {
          result += next;
          i++;
          continue;
        }
        if (char === '"') inDouble = false;
        continue;
      }

      if (inBacktick) {
        result += char;
        if (char === "\\" && next) {
          result += next;
          i++;
          continue;
        }
        if (char === "`") inBacktick = false;
        continue;
      }

      if (char === "'" && next === "'" && nextTwo === "'") {
        inTripleSingle = true;
        result += "'''";
        i += 2;
        continue;
      }

      if (char === '"' && next === '"' && nextTwo === '"') {
        inTripleDouble = true;
        result += '"""';
        i += 2;
        continue;
      }

      if (char === "'") {
        inSingle = true;
        result += char;
        continue;
      }

      if (char === '"') {
        inDouble = true;
        result += char;
        continue;
      }

      if (char === "`") {
        inBacktick = true;
        result += char;
        continue;
      }

      if (char === "#") {
        if (options.allowShebang && lineStart && next === "!") {
          result += char;
          continue;
        }
        while (i < content.length && content[i] !== "\n") {
          i++;
        }
        result += "\n";
        continue;
      }

      result += char;
    }

    return result;
  }

  private stripSqlComments(content: string): string {
    let result = "";
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const next = content[i + 1];

      if (inSingle) {
        result += char;
        if (char === "'" && content[i - 1] !== "\\") {
          inSingle = false;
        }
        continue;
      }

      if (inDouble) {
        result += char;
        if (char === '"' && content[i - 1] !== "\\") {
          inDouble = false;
        }
        continue;
      }

      if (char === "'") {
        inSingle = true;
        result += char;
        continue;
      }

      if (char === '"') {
        inDouble = true;
        result += char;
        continue;
      }

      if (char === "-" && next === "-") {
        while (i < content.length && content[i] !== "\n") {
          i++;
        }
        result += "\n";
        continue;
      }

      if (char === "/" && next === "*") {
        i += 2;
        while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) {
          i++;
        }
        i++;
        continue;
      }

      result += char;
    }

    return result;
  }

  private stripGoDocComments(content: string, onRemoved: (count: number) => void): string {
    const docPattern = /(^\s*\/\/.*\n)+(?=\s*(package|func|type|var|const)\b)/gm;
    let removed = 0;
    const result = content.replace(docPattern, (match) => {
      const lines = match.split("\n").filter((line) => line.trim().length > 0);
      removed += lines.length;
      return "";
    });
    if (removed > 0) onRemoved(removed);
    return result;
  }

  private minifyWhitespace(content: string): string {
    let result = content.replace(/[ \t]+$/gm, "");
    result = result.replace(/\n{4,}/g, "\n\n\n");
    result = result.replace(/^\n+/, "");
    result = result.replace(/\n+$/, "\n");

    return result;
  }

  getStats(originalTokens: number, optimizedTokens: number): OptimizationStats {
    const tokensSaved = originalTokens - optimizedTokens;
    const savingsPercent = originalTokens > 0
      ? Math.round((tokensSaved / originalTokens) * 100)
      : 0;

    return {
      originalTokens,
      optimizedTokens,
      tokensSaved,
      savingsPercent,
      truncatedFiles: this.truncatedFiles,
      commentsRemoved: this.commentsRemoved,
      docstringsRemoved: this.docstringsRemoved
    };
  }

  reset(): void {
    this.commentsRemoved = 0;
    this.docstringsRemoved = 0;
    this.truncatedFiles = [];
  }
}

```

## dependencyAnalyzer.ts

```ts
import * as path from "path";
import { DependencyGraph, DependencyEdge } from "./types";
import { AliasResolver } from "./aliasResolver";

export class DependencyAnalyzer {
  private basePath: string;
  private fileContents: Map<string, string>;
  private aliasResolver: AliasResolver;

  constructor(basePath: string, aliasResolver?: AliasResolver) {
    this.basePath = basePath;
    this.fileContents = new Map();
    this.aliasResolver = aliasResolver ?? new AliasResolver({ basePath });
  }

  addFile(relativePath: string, content: string): void {
    this.fileContents.set(relativePath, content);
  }

  analyze(): DependencyGraph {
    const nodes: string[] = Array.from(this.fileContents.keys());
    const edges: DependencyEdge[] = [];

    for (const [filePath, content] of this.fileContents) {
      const ext = path.extname(filePath).replace(".", "");
      const dependencies = this.extractDependencies(content, filePath, ext);

      for (const dep of dependencies) {
        // Try to resolve the dependency to a file in our export
        const resolved = this.resolveDependency(dep.path, filePath);
        if (resolved && nodes.includes(resolved)) {
          edges.push({
            from: filePath,
            to: resolved,
            type: dep.type
          });
        }
      }
    }

    return { nodes, edges };
  }

  private extractDependencies(
    content: string,
    filePath: string,
    extension: string
  ): Array<{ path: string; type: "import" | "require" | "dynamic" }> {
    const deps: Array<{ path: string; type: "import" | "require" | "dynamic" }> = [];

    switch (extension) {
      case "js":
      case "jsx":
      case "ts":
      case "tsx":
      case "mjs":
      case "cjs":
        // ES6 imports: import x from 'path' or import 'path'
        const importMatches = content.matchAll(
          /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g
        );
        for (const match of importMatches) {
          if (this.isLocalImport(match[1])) {
            deps.push({ path: match[1], type: "import" });
          }
        }

        // Dynamic imports: import('path')
        const dynamicMatches = content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
        for (const match of dynamicMatches) {
          if (this.isLocalImport(match[1])) {
            deps.push({ path: match[1], type: "dynamic" });
          }
        }

        // CommonJS requires: require('path')
        const requireMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
        for (const match of requireMatches) {
          if (this.isLocalImport(match[1])) {
            deps.push({ path: match[1], type: "require" });
          }
        }

        // Re-exports: export * from 'path' or export { x } from 'path'
        const reexportMatches = content.matchAll(
          /export\s+(?:(?:\*|{[^}]*})\s+from\s+)['"]([^'"]+)['"]/g
        );
        for (const match of reexportMatches) {
          if (this.isLocalImport(match[1])) {
            deps.push({ path: match[1], type: "import" });
          }
        }
        break;

      case "py":
        // Python imports: from x import y or import x
        const pyFromMatches = content.matchAll(/from\s+(\.\S+|\w+(?:\.\w+)*)\s+import/g);
        for (const match of pyFromMatches) {
          if (match[1].startsWith(".")) {
            deps.push({ path: match[1], type: "import" });
          }
        }

        const pyImportMatches = content.matchAll(/^import\s+(\w+(?:\.\w+)*)/gm);
        for (const match of pyImportMatches) {
          // Only local imports (relative to the file)
          if (!this.isPythonStdLib(match[1])) {
            deps.push({ path: match[1], type: "import" });
          }
        }
        break;

      case "go":
        // Go imports
        const goImportMatches = content.matchAll(/import\s+(?:\w+\s+)?["']([^"']+)["']/g);
        for (const match of goImportMatches) {
          // Only local imports (not standard library)
          if (match[1].includes("/") && !match[1].includes(".")) {
            deps.push({ path: match[1], type: "import" });
          }
        }
        break;

      case "rs":
        // Rust: use crate:: or mod
        const rustModMatches = content.matchAll(/(?:use\s+(?:crate|super|self)::(\w+)|mod\s+(\w+))/g);
        for (const match of rustModMatches) {
          const modName = match[1] || match[2];
          if (modName) {
            deps.push({ path: modName, type: "import" });
          }
        }
        break;

      case "vue":
      case "svelte":
        // Extract script content and process as JS/TS
        const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
          const scriptDeps = this.extractDependencies(scriptMatch[1], filePath, "ts");
          deps.push(...scriptDeps);
        }
        break;
    }

    return deps;
  }

  private isLocalImport(importPath: string): boolean {
    return importPath.startsWith(".")
      || importPath.startsWith("/")
      || this.aliasResolver.isAliasImport(importPath);
  }

  private isPythonStdLib(moduleName: string): boolean {
    // Common Python standard library modules
    const stdLib = [
      "os", "sys", "re", "json", "math", "time", "datetime", "collections",
      "itertools", "functools", "typing", "pathlib", "io", "string", "random",
      "copy", "subprocess", "threading", "multiprocessing", "asyncio", "socket",
      "http", "urllib", "email", "html", "xml", "logging", "unittest", "doctest",
      "argparse", "configparser", "csv", "sqlite3", "hashlib", "hmac", "secrets"
    ];
    const topModule = moduleName.split(".")[0];
    return stdLib.includes(topModule);
  }

  private resolveDependency(depPath: string, fromFile: string): string | null {
    const fromDir = path.dirname(fromFile);

    // Handle relative paths
    if (depPath.startsWith(".")) {
      const resolved = path.normalize(path.join(fromDir, depPath));
      return this.probeFileSystem(resolved);
    }

    const aliasResolved = this.aliasResolver.resolve(depPath);
    if (aliasResolved) {
      return this.probeFileSystem(path.normalize(aliasResolved));
    }

    return null;
  }

  private probeFileSystem(basePath: string): string | null {
    if (this.fileContents.has(basePath)) {
      return basePath;
    }

    const extensions = [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".py", ".go", ".rs"];
    for (const ext of extensions) {
      const candidate = `${basePath}${ext}`;
      if (this.fileContents.has(candidate)) {
        return candidate;
      }
    }

    for (const ext of extensions) {
      const indexPath = path.join(basePath, `index${ext}`);
      if (this.fileContents.has(indexPath)) {
        return indexPath;
      }
    }

    return null;
  }

  clear(): void {
    this.fileContents.clear();
  }
}

```

## exportLogger.ts

```ts
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

  async showDetailedReport(showNotifications = true): Promise<void> {
    if (!showNotifications) return;
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

```

## exportOptimization.ts

```ts
import * as path from "path";
import { AiContextOptimizerConfig } from "./types";
import { ContextOptimizer } from "./contextOptimizer";

export interface FileStatsLike {
  mtime: Date;
}

export type GetFileStats = (filePath: string) => Promise<FileStatsLike>;

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

export async function prioritizeFiles(
  files: string[],
  folderUri: string,
  getFileStats: GetFileStats,
  prioritizeRecentFiles: boolean
): Promise<string[]> {
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

  const scored = await Promise.all(files.map(async (file) => {
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
      const stats = await getFileStats(file);
      mtime = stats.mtime.getTime();
    } catch {
      mtime = 0;
    }

    return { file, score, mtime, relativePath };
  }));

  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (prioritizeRecentFiles && a.mtime !== b.mtime) return b.mtime - a.mtime;
      return a.relativePath.localeCompare(b.relativePath);
    })
    .map((item) => item.file);
}

export async function buildOptimizationPipeline(
  config: AiContextOptimizerConfig,
  files: string[],
  folderUri: string,
  getFileStats: GetFileStats
): Promise<OptimizationPipeline> {
  const useOptimizer = config?.enabled === true;
  const orderedFiles = useOptimizer
    ? await prioritizeFiles(files, folderUri, getFileStats, config.prioritizeRecentFiles)
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

```

## exportWorkflow.ts

```ts
import * as fs from "fs/promises";
import * as https from "https";
import * as path from "path";
import * as vscode from "vscode";
import { ServiceContainerFactory } from "./serviceContainer";
import {
  AiContextSummary,
  ContextSummaryFile,
  ExportConfig,
  ExportPreset,
  JsonExportFile,
  JsonExportOutput,
  PrivacyReport
} from "./types";
import { DependencyAnalyzer } from "./dependencyAnalyzer";
import {
  buildOptimizationPipeline,
  optimizeContent,
  wouldExceedBudget
} from "./exportOptimization";
import { maskContent } from "./privacyMasker";
import { exportMarkdownToPdf } from "./pdfExporter";

const CONCURRENCY_LIMIT = 4;

function shouldNotify(config: ExportConfig): boolean {
  return config.showNotifications;
}

function notifyInfo(config: ExportConfig, message: string, ...actions: string[]): Thenable<string | undefined> {
  if (!shouldNotify(config)) return Promise.resolve(undefined);
  return actions.length > 0
    ? vscode.window.showInformationMessage(message, ...actions)
    : vscode.window.showInformationMessage(message);
}

function notifyWarning(config: ExportConfig, message: string, ...actions: string[]): Thenable<string | undefined> {
  if (!shouldNotify(config)) return Promise.resolve(undefined);
  return actions.length > 0
    ? vscode.window.showWarningMessage(message, ...actions)
    : vscode.window.showWarningMessage(message);
}

function notifyError(config: ExportConfig, message: string): Thenable<string | undefined> {
  if (!shouldNotify(config)) return Promise.resolve(undefined);
  return vscode.window.showErrorMessage(message);
}

function getProgressLocation(config: ExportConfig): vscode.ProgressLocation {
  return shouldNotify(config) ? vscode.ProgressLocation.Notification : vscode.ProgressLocation.Window;
}

async function runWithConcurrency<T>(
  items: string[],
  limit: number,
  task: (item: string, index: number) => Promise<T>,
  onResult: (result: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const inFlight = new Map<number, Promise<T>>();
  const start = (index: number) => {
    inFlight.set(index, task(items[index], index));
  };
  const initial = Math.min(limit, items.length);
  for (let i = 0; i < initial; i++) start(i);

  for (let i = 0; i < items.length; i++) {
    const current = inFlight.get(i);
    if (!current) continue;
    const result = await current;
    inFlight.delete(i);
    const nextIndex = i + limit;
    if (nextIndex < items.length) start(nextIndex);
    await onResult(result, i);
  }
}

export interface ProcessOptions {
  folderUri: string;
  filteredFiles: string[];
  selectedTemplate: string;
  skipEmpty: boolean;
  outputFormat: string;
  outputPath: string;
  exportPreset: ExportPreset;
  excludedFiles?: ContextSummaryFile[];
  privacyModeEnabled: boolean;
  openAfterExport: boolean;
  notebooklmUploadEnabled: boolean;
  log?: (message: string) => void;
}

export async function buildFileSelectionSummary(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  rawFiles: string[],
  folderUri: string,
  selectedExtensions: string[],
  useSmartFilters: boolean,
  exportPreset: ExportPreset
): Promise<{ filteredFiles: string[]; excludedFiles: ContextSummaryFile[] }> {
  const excludedFiles: ContextSummaryFile[] = [];
  const filteredFiles: string[] = [];

  for (const file of rawFiles) {
    const reason = await services.filter.getExcludeReason(
      file,
      folderUri,
      selectedExtensions,
      useSmartFilters
    );

    if (reason) {
      if (exportPreset === "ai-pack") {
        excludedFiles.push({ path: path.relative(folderUri, file), reason });
      }
      continue;
    }

    filteredFiles.push(file);
  }

  return { filteredFiles, excludedFiles };
}

export async function processFiles(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  options: ProcessOptions
): Promise<void> {
  const {
    folderUri,
    filteredFiles,
    selectedTemplate,
    skipEmpty,
    outputFormat,
    outputPath,
    exportPreset,
    privacyModeEnabled,
    openAfterExport,
    notebooklmUploadEnabled,
    log
  } = options;

  if (exportPreset === "ai-pack") {
    log?.("Starting AI Pack export...");
    await processFilesAsAiPack(services, config, options);
    return;
  }

  if (outputFormat === ".pdf") {
    log?.("Starting PDF export...");
    await processFilesAsPdf(services, config, options);
    return;
  }

  if (outputFormat === ".json") {
    log?.("Starting JSON export...");
    await processFilesAsJson(services, config, options);
    return;
  }

  const privacyConfig = buildPrivacyConfig(config, privacyModeEnabled);
  const privacyReport = initPrivacyReport(privacyConfig.enabled);

  const optimization = await buildOptimizationPipeline(
    config.aiContextOptimizer,
    filteredFiles,
    folderUri,
    (filePath) => services.fileSystem.getFileStats(filePath)
  );
  let totalOptimizedTokens = 0;

  const managers = ServiceContainerFactory.createExportManagers(
    outputPath,
    outputFormat,
    config.maxChunkSize
  );

  await vscode.window.withProgress(
    { location: getProgressLocation(config), title: "Exporting code...", cancellable: false },
    async (progress) => {
      const orderedFiles = optimization.orderedFiles;
      const totalFiles = orderedFiles.length;
      const limit = Math.min(CONCURRENCY_LIMIT, totalFiles);

      await runWithConcurrency(
        orderedFiles,
        limit,
        async (file) => {
          try {
            const [content, stats] = await Promise.all([
              services.fileSystem.readFile(file),
              services.fileSystem.getFileStats(file)
            ]);
            return { ok: true as const, file, content, stats };
          } catch (error) {
            return { ok: false as const, file, error: error as Error };
          }
        },
        async (result, index) => {
          const file = result.file;
          managers.logger.incrementTotal();

          if (!result.ok) {
            managers.logger.recordError(file, result.error);
            log?.(`Error processing ${file}: ${result.error.message}`);
            return;
          }

          let content = result.content;
          if (privacyConfig.enabled) {
            const masked = maskContent(content, privacyConfig);
            content = masked.maskedContent;
            applyPrivacyStats(privacyReport, path.relative(folderUri, file), masked);
          }
          if (config.compactMode) content = content.replace(/\s+/g, " ");
          const relativePath = path.relative(folderUri, file);
          const extension = path.extname(file).replace(".", "");
          const optimizedResult = optimizeContent(content, file, extension, optimization.optimizer);
          const optimizedContent = optimizedResult.optimizedContent;

          if (skipEmpty && optimizedContent.trim().length === 0) {
            log?.(`Skipped empty file: ${relativePath}`);
            managers.logger.recordSkipped(file, "empty");
            return;
          }

          if (optimization.useOptimizer && wouldExceedBudget(
            totalOptimizedTokens,
            optimizedResult.optimizedTokens,
            optimization.maxTokenBudget
          )) {
            log?.(`Skipped due to budget: ${relativePath}`);
            managers.logger.recordSkipped(file, "budget");
            return;
          }

          totalOptimizedTokens += optimizedResult.optimizedTokens;
          const lines = optimizedContent.split("\n").length;
          const formatted = services.template.formatContent(
            selectedTemplate,
            relativePath,
            optimizedContent,
            file,
            outputFormat
          );

          await managers.chunk.addContent(formatted);
          managers.logger.recordProcessed(
            optimizedContent.length,
            lines,
            optimizedResult.optimizedTokens,
            extension
          );

          const stats = managers.logger.getStats();
          services.statusBar.setExporting(
            index + 1,
            totalFiles,
            stats.estimatedTokens,
            stats.totalSize
          );

          progress.report({
            increment: ((index + 1) / totalFiles) * 100,
            message: `Processing: ${path.basename(file)}`
          });
        }
      );

      const writtenFiles = await managers.chunk.finalize();
      const finalStats = managers.logger.getStats();
      if (writtenFiles.length === 0) {
        services.statusBar.setComplete(finalStats.processedFiles, finalStats.estimatedTokens, finalStats.totalSize);
        log?.("Export produced no output.");
        await notifyWarning(
          config,
          "Export produced no output. All files were skipped or empty (filters, skip-empty, or token budget)."
        );
        return;
      }

      services.statusBar.setComplete(finalStats.processedFiles, finalStats.estimatedTokens, finalStats.totalSize);

      if (config.copyToClipboard && writtenFiles.length > 0) {
        const clipboardContent = await fs.readFile(writtenFiles[0], "utf8");
        await vscode.env.clipboard.writeText(clipboardContent);
      }

      const stats = managers.logger.getStats();
      const message = config.showTokenEstimate
        ? managers.logger.formatSummary()
        : `Code exported to: ${outputPath}\nFiles written: ${stats.processedFiles}, skipped: ${stats.skippedFiles}`;

      const actions = [];
      if (stats.errorFiles > 0) actions.push("View Errors");
      if (config.showTokenEstimate) actions.push("View Details");
      if (privacyReport.enabled && privacyReport.totalMasked > 0) actions.push("View Privacy Report");

      const action = await notifyInfo(config, message, ...actions);

      if (stats.errorFiles > 0) {
        console.warn("Errors:", stats.errors);
      }

      if (openAfterExport && writtenFiles.length > 0) {
        vscode.window.showTextDocument(vscode.Uri.file(writtenFiles[0]));
      }
      if (action === "View Errors") {
        await managers.logger.showDetailedReport(config.showNotifications);
      } else if (action === "View Details") {
        await notifyInfo(config, managers.logger.formatDetailedSummary());
      } else if (action === "View Privacy Report") {
        await openPrivacyReport(privacyReport, "Privacy Report");
      }

      if (notebooklmUploadEnabled) {
        await tryUploadToNotebooklm(outputPath, config, log);
      }
      log?.("Export completed.");
    }
  );
}

async function processFilesAsJson(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  options: ProcessOptions
): Promise<void> {
  const {
    folderUri,
    filteredFiles,
    skipEmpty,
    outputPath,
    privacyModeEnabled,
    openAfterExport,
    notebooklmUploadEnabled,
    log
  } = options;

  const privacyConfig = buildPrivacyConfig(config, privacyModeEnabled);
  const privacyReport = initPrivacyReport(privacyConfig.enabled);

  const optimization = await buildOptimizationPipeline(
    config.aiContextOptimizer,
    filteredFiles,
    folderUri,
    (filePath) => services.fileSystem.getFileStats(filePath)
  );

  const jsonFiles: JsonExportFile[] = [];
  let totalSize = 0;
  let totalLines = 0;
  let totalTokens = 0;
  let totalOriginalTokens = 0;
  const extensions = new Set<string>();
  let processedCount = 0;
  let skippedCount = 0;
  const dependencyAnalyzer = config.includeDependencyGraph
    ? new DependencyAnalyzer(folderUri)
    : null;

  await vscode.window.withProgress(
    { location: getProgressLocation(config), title: "Exporting to JSON...", cancellable: false },
    async (progress) => {
      const orderedFiles = optimization.orderedFiles;
      const totalFiles = orderedFiles.length;
      const limit = Math.min(CONCURRENCY_LIMIT, totalFiles);

      await runWithConcurrency(
        orderedFiles,
        limit,
        async (file) => {
          try {
            const [content, stats] = await Promise.all([
              services.fileSystem.readFile(file),
              services.fileSystem.getFileStats(file)
            ]);
            return { ok: true as const, file, content, stats };
          } catch (error) {
            return { ok: false as const, file, error: error as Error };
          }
        },
        async (result, index) => {
          const file = result.file;
          if (!result.ok) {
            console.warn(`Failed to process ${file}:`, result.error);
            log?.(`Error processing ${file}: ${result.error.message}`);
            return;
          }

          let content = result.content;
          if (privacyConfig.enabled) {
            const masked = maskContent(content, privacyConfig);
            content = masked.maskedContent;
            applyPrivacyStats(privacyReport, path.relative(folderUri, file), masked);
          }
          if (config.compactMode) content = content.replace(/\s+/g, " ");
          const stats = result.stats;
          const relativePath = path.relative(folderUri, file);
          const ext = path.extname(file).replace(".", "");
          const optimizedResult = optimizeContent(content, file, ext, optimization.optimizer);
          const optimizedContent = optimizedResult.optimizedContent;

          if (skipEmpty && optimizedContent.trim().length === 0) {
            skippedCount++;
            log?.(`Skipped empty file: ${relativePath}`);
            return;
          }

          if (optimization.useOptimizer && wouldExceedBudget(
            totalTokens,
            optimizedResult.optimizedTokens,
            optimization.maxTokenBudget
          )) {
            skippedCount++;
            log?.(`Skipped due to budget: ${relativePath}`);
            return;
          }

          const lines = optimizedContent.split("\n").length;

          extensions.add(ext);
          totalSize += optimizedContent.length;
          totalLines += lines;
          totalTokens += optimizedResult.optimizedTokens;
          totalOriginalTokens += optimizedResult.originalTokens;
          processedCount++;

          if (dependencyAnalyzer) {
            dependencyAnalyzer.addFile(relativePath, optimizedContent);
          }

          jsonFiles.push({
            path: relativePath,
            extension: ext,
            content: optimizedContent,
            size: optimizedContent.length,
            lines,
            tokens: optimizedResult.optimizedTokens,
            modified: stats.mtime.toISOString()
          });

          services.statusBar.setExporting(
            index + 1,
            totalFiles,
            totalTokens,
            totalSize
          );

          progress.report({
            increment: ((index + 1) / totalFiles) * 100,
            message: `Processing: ${path.basename(file)}`
          });
        }
      );

      const jsonOutput: JsonExportOutput = {
        metadata: {
          exportedAt: new Date().toISOString(),
          sourceFolder: path.basename(folderUri),
          totalFiles: processedCount,
          totalSize,
          totalLines,
          estimatedTokens: totalTokens,
          extensions: Array.from(extensions).sort(),
          version: "1.0"
        },
        files: jsonFiles
      };

      if (dependencyAnalyzer) {
        const graph = dependencyAnalyzer.analyze();
        const dependencies: Record<string, string[]> = {};

        for (const node of graph.nodes) {
          dependencies[node] = [];
        }

        for (const edge of graph.edges) {
          if (!dependencies[edge.from]) dependencies[edge.from] = [];
          if (!dependencies[edge.from].includes(edge.to)) {
            dependencies[edge.from].push(edge.to);
          }
        }

        for (const node of Object.keys(dependencies)) {
          dependencies[node].sort();
        }

        jsonOutput.metadata.dependencies = dependencies;
        jsonOutput.dependencyGraph = graph;
      }

      if (optimization.useOptimizer && optimization.optimizer) {
        jsonOutput.optimizationStats = optimization.optimizer.getStats(
          totalOriginalTokens,
          totalTokens
        );
      }
      if (privacyReport.enabled) {
        jsonOutput.privacyReport = privacyReport;
      }

      await fs.writeFile(outputPath, JSON.stringify(jsonOutput, null, 2), "utf8");

      services.statusBar.setComplete(processedCount, totalTokens, totalSize);

      if (config.copyToClipboard) {
        await vscode.env.clipboard.writeText(JSON.stringify(jsonOutput, null, 2));
      }

      const sizeFormatted = totalSize < 1024 * 1024
        ? `${(totalSize / 1024).toFixed(1)} KB`
        : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
      const tokensFormatted = totalTokens < 1000
        ? totalTokens.toString()
        : `${(totalTokens / 1000).toFixed(1)}k`;

      const message = `JSON exported: ${processedCount} files | ${sizeFormatted} | ~${tokensFormatted} tokens`;

      const actions = [];
      if (skippedCount > 0) actions.push(`${skippedCount} Skipped`);
      if (privacyReport.enabled && privacyReport.totalMasked > 0) actions.push("View Privacy Report");

      const action = await notifyInfo(config, message, ...actions);

      if (openAfterExport) {
        vscode.window.showTextDocument(vscode.Uri.file(outputPath));
      }
      if (action === "View Privacy Report") {
        await openPrivacyReport(privacyReport, "Privacy Report");
      }

      if (notebooklmUploadEnabled) {
        await tryUploadToNotebooklm(outputPath, config, log);
      }
      log?.("JSON export completed.");
    }
  );
}

async function processFilesAsPdf(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  options: ProcessOptions
): Promise<void> {
  const {
    folderUri,
    filteredFiles,
    selectedTemplate,
    skipEmpty,
    outputPath,
    privacyModeEnabled,
    openAfterExport,
    notebooklmUploadEnabled,
    log
  } = options;

  const privacyConfig = buildPrivacyConfig(config, privacyModeEnabled);
  const privacyReport = initPrivacyReport(privacyConfig.enabled);

  const optimization = await buildOptimizationPipeline(
    config.aiContextOptimizer,
    filteredFiles,
    folderUri,
    (filePath) => services.fileSystem.getFileStats(filePath)
  );

  const markdownParts: string[] = [];
  let totalOptimizedTokens = 0;
  let totalSize = 0;
  let totalLines = 0;
  let processedCount = 0;
  let skippedCount = 0;

  await vscode.window.withProgress(
    { location: getProgressLocation(config), title: "Exporting to PDF...", cancellable: false },
    async (progress) => {
      const orderedFiles = optimization.orderedFiles;
      const totalFiles = orderedFiles.length;
      const limit = Math.min(CONCURRENCY_LIMIT, totalFiles);

      await runWithConcurrency(
        orderedFiles,
        limit,
        async (file) => {
          try {
            const content = await services.fileSystem.readFile(file);
            return { ok: true as const, file, content };
          } catch (error) {
            return { ok: false as const, file, error: error as Error };
          }
        },
        async (result, index) => {
          const file = result.file;
          if (!result.ok) {
            console.warn(`Failed to process ${file}:`, result.error);
            log?.(`Error processing ${file}: ${result.error.message}`);
            return;
          }

          let content = result.content;
          if (privacyConfig.enabled) {
            const masked = maskContent(content, privacyConfig);
            content = masked.maskedContent;
            applyPrivacyStats(privacyReport, path.relative(folderUri, file), masked);
          }
          if (config.compactMode) content = content.replace(/\s+/g, " ");
          const relativePath = path.relative(folderUri, file);
          const extension = path.extname(file).replace(".", "");
          const optimizedResult = optimizeContent(content, file, extension, optimization.optimizer);
          const optimizedContent = optimizedResult.optimizedContent;

          if (skipEmpty && optimizedContent.trim().length === 0) {
            skippedCount++;
            log?.(`Skipped empty file: ${relativePath}`);
            return;
          }

          if (optimization.useOptimizer && wouldExceedBudget(
            totalOptimizedTokens,
            optimizedResult.optimizedTokens,
            optimization.maxTokenBudget
          )) {
            skippedCount++;
            log?.(`Skipped due to budget: ${relativePath}`);
            return;
          }

          totalOptimizedTokens += optimizedResult.optimizedTokens;
          totalSize += optimizedContent.length;
          totalLines += optimizedContent.split("\n").length;
          processedCount++;

          const formatted = services.template.formatContent(
            selectedTemplate || "default-md",
            relativePath,
            optimizedContent,
            file,
            ".md"
          );
          markdownParts.push(formatted);

          progress.report({
            increment: ((index + 1) / totalFiles) * 100,
            message: `Processing: ${path.basename(file)}`
          });
        }
      );

      const markdownContent = markdownParts.join("");
      if (markdownContent.trim().length === 0) {
        await notifyWarning(
          config,
          "Export produced no output. All files were skipped or empty (filters, skip-empty, or token budget)."
        );
        return;
      }

      await exportMarkdownToPdf(markdownContent, outputPath);
      log?.("PDF generated.");

      if (config.copyToClipboard) {
        await vscode.env.clipboard.writeText(markdownContent);
      }

      const sizeFormatted = totalSize < 1024 * 1024
        ? `${(totalSize / 1024).toFixed(1)} KB`
        : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
      const tokensFormatted = totalOptimizedTokens < 1000
        ? totalOptimizedTokens.toString()
        : `${(totalOptimizedTokens / 1000).toFixed(1)}k`;

      const message = `PDF exported: ${processedCount} files | ${sizeFormatted} | ~${tokensFormatted} tokens`;
      const actions = [];
      if (skippedCount > 0) actions.push(`${skippedCount} Skipped`);
      if (privacyReport.enabled && privacyReport.totalMasked > 0) actions.push("View Privacy Report");

      const action = await notifyInfo(config, message, ...actions);

      if (openAfterExport) {
        vscode.window.showTextDocument(vscode.Uri.file(outputPath));
      }
      if (action === "View Privacy Report") {
        await openPrivacyReport(privacyReport, "Privacy Report");
      }

      if (notebooklmUploadEnabled) {
        await tryUploadToNotebooklm(outputPath, config, log);
      }
      log?.("PDF export completed.");
    }
  );
}

async function processFilesAsAiPack(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  config: ReturnType<typeof services.config.load>,
  options: ProcessOptions
): Promise<void> {
  const {
    folderUri,
    filteredFiles,
    skipEmpty,
    outputPath,
    selectedTemplate,
    excludedFiles,
    privacyModeEnabled,
    openAfterExport,
    notebooklmUploadEnabled,
    log
  } = options;
  const aiConfig = buildAiPackConfig(config);
  const { jsonPath, mdPath } = getAiPackPaths(outputPath);
  const privacyConfig = buildPrivacyConfig(config, privacyModeEnabled);
  const privacyReport = initPrivacyReport(privacyConfig.enabled);

  const optimization = await buildOptimizationPipeline(
    aiConfig.aiContextOptimizer,
    filteredFiles,
    folderUri,
    (filePath) => services.fileSystem.getFileStats(filePath)
  );

  const jsonFiles: JsonExportFile[] = [];
  const includedFiles: ContextSummaryFile[] = [];
  const excluded: ContextSummaryFile[] = excludedFiles ? [...excludedFiles] : [];
  let totalSize = 0;
  let totalLines = 0;
  let totalTokens = 0;
  let totalOriginalTokens = 0;
  const extensions = new Set<string>();
  let processedCount = 0;
  const dependencyAnalyzer = aiConfig.includeDependencyGraph
    ? new DependencyAnalyzer(folderUri)
    : null;
  const mdEntries: Array<{
    filePath: string;
    relativePath: string;
    extension: string;
    content: string;
  }> = [];

  await vscode.window.withProgress(
    { location: getProgressLocation(config), title: "Exporting AI Pack...", cancellable: false },
    async (progress) => {
      const orderedFiles = optimization.orderedFiles;
      const totalFiles = orderedFiles.length;
      const limit = Math.min(CONCURRENCY_LIMIT, totalFiles);

      await runWithConcurrency(
        orderedFiles,
        limit,
        async (file) => {
          try {
            const [content, stats] = await Promise.all([
              services.fileSystem.readFile(file),
              services.fileSystem.getFileStats(file)
            ]);
            return { ok: true as const, file, content, stats };
          } catch (error) {
            return { ok: false as const, file, error: error as Error };
          }
        },
        async (result, index) => {
          const file = result.file;
          if (!result.ok) {
            const relativePath = path.relative(folderUri, file);
            excluded.push({ path: relativePath, reason: "error" });
            log?.(`Error processing ${relativePath}: ${result.error.message}`);
            return;
          }

          let content = result.content;
          if (privacyConfig.enabled) {
            const masked = maskContent(content, privacyConfig);
            content = masked.maskedContent;
            applyPrivacyStats(privacyReport, path.relative(folderUri, file), masked);
          }
          if (aiConfig.compactMode) content = content.replace(/\s+/g, " ");
          const stats = result.stats;
          const relativePath = path.relative(folderUri, file);
          const ext = path.extname(file).replace(".", "");
          const optimizedResult = optimizeContent(content, file, ext, optimization.optimizer);
          const optimizedContent = optimizedResult.optimizedContent;

          if (skipEmpty && optimizedContent.trim().length === 0) {
            excluded.push({ path: relativePath, reason: "empty" });
            log?.(`Skipped empty file: ${relativePath}`);
            return;
          }

          if (optimization.useOptimizer && wouldExceedBudget(
            totalTokens,
            optimizedResult.optimizedTokens,
            optimization.maxTokenBudget
          )) {
            excluded.push({ path: relativePath, reason: "token-budget" });
            log?.(`Skipped due to budget: ${relativePath}`);
            return;
          }

          const lines = optimizedContent.split("\n").length;

          extensions.add(ext);
          totalSize += optimizedContent.length;
          totalLines += lines;
          totalTokens += optimizedResult.optimizedTokens;
          totalOriginalTokens += optimizedResult.originalTokens;
          processedCount++;

          includedFiles.push({ path: relativePath, reason: "included" });

          if (dependencyAnalyzer) {
            dependencyAnalyzer.addFile(relativePath, optimizedContent);
          }

          jsonFiles.push({
            path: relativePath,
            extension: ext,
            content: optimizedContent,
            size: optimizedContent.length,
            lines,
            tokens: optimizedResult.optimizedTokens,
            modified: stats.mtime.toISOString()
          });
          mdEntries.push({
            filePath: file,
            relativePath,
            extension: ext,
            content: optimizedContent
          });

          services.statusBar.setExporting(
            index + 1,
            totalFiles,
            totalTokens,
            totalSize
          );

          progress.report({
            increment: ((index + 1) / totalFiles) * 100,
            message: `Processing: ${path.basename(file)}`
          });
        }
      );

      const selectionNotes = [
        "Entry points and recent files prioritized",
        "Token budget enforced",
        "Comments removed and whitespace minified",
        "Large files truncated by line limit"
      ];

      const summary: AiContextSummary = {
        preset: "ai-pack",
        formatVersion: "1.0",
        tokenBudget: optimization.maxTokenBudget,
        includedCount: includedFiles.length,
        excludedCount: excluded.length,
        included: includedFiles,
        excluded,
        selectionNotes,
        promptTemplate: ""
      };

      const topFiles = optimization.orderedFiles
        .slice(0, 10)
        .map((file) => path.relative(folderUri, file));
      summary.promptTemplate = buildAiPromptTemplate(
        path.basename(folderUri),
        summary,
        topFiles,
        privacyReport.enabled ? privacyReport : null
      );

      const jsonOutput: JsonExportOutput = {
        metadata: {
          exportedAt: new Date().toISOString(),
          sourceFolder: path.basename(folderUri),
          totalFiles: processedCount,
          totalSize,
          totalLines,
          estimatedTokens: totalTokens,
          extensions: Array.from(extensions).sort(),
          version: "1.0"
        },
        files: jsonFiles,
        contextSummary: summary
      };

      if (dependencyAnalyzer) {
        const graph = dependencyAnalyzer.analyze();
        const dependencies: Record<string, string[]> = {};

        for (const node of graph.nodes) {
          dependencies[node] = [];
        }

        for (const edge of graph.edges) {
          if (!dependencies[edge.from]) dependencies[edge.from] = [];
          if (!dependencies[edge.from].includes(edge.to)) {
            dependencies[edge.from].push(edge.to);
          }
        }

        for (const node of Object.keys(dependencies)) {
          dependencies[node].sort();
        }

        jsonOutput.metadata.dependencies = dependencies;
        jsonOutput.dependencyGraph = graph;
      }

      if (optimization.useOptimizer && optimization.optimizer) {
        jsonOutput.optimizationStats = optimization.optimizer.getStats(
          totalOriginalTokens,
          totalTokens
        );
      }
      if (privacyReport.enabled) {
        jsonOutput.privacyReport = privacyReport;
      }

      await fs.writeFile(jsonPath, JSON.stringify(jsonOutput, null, 2), "utf8");

      const managers = ServiceContainerFactory.createExportManagers(
        mdPath,
        ".md",
        aiConfig.maxChunkSize
      );

      const summaryHeader = [
        "# AI Export Pack",
        "",
        "## Context summary",
        `- Included files: ${summary.includedCount}`,
        `- Excluded files: ${summary.excludedCount}`,
        `- Token budget: ${summary.tokenBudget}`,
        privacyReport.enabled ? `- Masked items: ${privacyReport.totalMasked}` : "",
        "",
        "## AI prompt template",
        "```",
        summary.promptTemplate,
        "```",
        "",
        "## Exported files"
      ].join("\n");

      await managers.chunk.addContent(`\n\n${summaryHeader}\n`);
      for (const entry of mdEntries) {
        const formatted = services.template.formatContent(
          selectedTemplate || "ai-ready",
          entry.relativePath,
          entry.content,
          entry.filePath,
          ".md"
        );
        await managers.chunk.addContent(formatted);
      }
      const writtenFiles = await managers.chunk.finalize();

      services.statusBar.setComplete(processedCount, totalTokens, totalSize);

      if (aiConfig.copyToClipboard) {
        await vscode.env.clipboard.writeText(await fs.readFile(jsonPath, "utf8"));
      }

      const sizeFormatted = totalSize < 1024 * 1024
        ? `${(totalSize / 1024).toFixed(1)} KB`
        : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
      const tokensFormatted = totalTokens < 1000
        ? totalTokens.toString()
        : `${(totalTokens / 1000).toFixed(1)}k`;

      const message = `AI Pack exported: ${processedCount} files | ${sizeFormatted} | ~${tokensFormatted} tokens`;
      const actions = [];
      if (privacyReport.enabled && privacyReport.totalMasked > 0) actions.push("View Privacy Report");
      const action = await notifyInfo(config, message, ...actions);

      if (openAfterExport) {
        vscode.window.showTextDocument(vscode.Uri.file(jsonPath));
      }
      if (action === "View Privacy Report") {
        await openPrivacyReport(privacyReport, "Privacy Report");
      }

      if (notebooklmUploadEnabled) {
        await tryUploadToNotebooklm(mdPath, config, log);
      }
      log?.("AI Pack export completed.");
    }
  );
}

function buildAiPackConfig(config: ExportConfig): ExportConfig {
  return {
    ...config,
    aiContextOptimizer: {
      ...config.aiContextOptimizer,
      enabled: true,
      removeComments: true,
      minifyWhitespace: true,
      truncateLargeFiles: true,
      maxLinesPerFile: Math.min(config.aiContextOptimizer.maxLinesPerFile || 500, 600),
      prioritizeRecentFiles: true
    }
  };
}

function buildAiPromptTemplate(
  projectName: string,
  summary: AiContextSummary,
  topFiles: string[],
  privacyReport: PrivacyReport | null
): string {
  const privacyNote = privacyReport && privacyReport.enabled && privacyReport.totalMasked > 0
    ? "Sensitive data has been masked in this export."
    : "";
  const fileList = topFiles.length > 0 ? topFiles.join("\n") : "(no files)";
  return [
    `You are an AI assistant working on the project "${projectName}".`,
    `Context: ${summary.includedCount} files included, ${summary.excludedCount} excluded.`,
    `Token budget: ${summary.tokenBudget}.`,
    privacyNote ? `Privacy: ${privacyNote}` : "",
    "",
    "Priority files:",
    fileList,
    "",
    "Instructions:",
    "1) Use the provided files as the single source of truth.",
    "2) If anything is missing, ask for the specific file/path.",
    "3) Provide concise, actionable output with code references.",
    "",
    "Task:",
    "- [Describe the task you want the AI to perform]"
  ].join("\n");
}

function getAiPackPaths(outputPath: string): { jsonPath: string; mdPath: string } {
  const ext = path.extname(outputPath);
  const base = ext ? outputPath.slice(0, -ext.length) : outputPath;
  return { jsonPath: `${base}.json`, mdPath: `${base}.md` };
}

function buildPrivacyConfig(config: ExportConfig, enabledOverride: boolean): ExportConfig["privacyMode"] {
  return {
    ...config.privacyMode,
    enabled: enabledOverride
  };
}

function initPrivacyReport(enabled: boolean): PrivacyReport {
  return {
    enabled,
    totalMasked: 0,
    byType: {},
    files: []
  };
}

function applyPrivacyStats(
  report: PrivacyReport,
  relativePath: string,
  maskedResult: { totalMasked: number; byType: Record<string, number> }
): void {
  if (!report.enabled || maskedResult.totalMasked === 0) return;
  report.totalMasked += maskedResult.totalMasked;
  for (const [key, value] of Object.entries(maskedResult.byType)) {
    report.byType[key] = (report.byType[key] || 0) + value;
  }
  report.files.push({ path: relativePath, masked: maskedResult.totalMasked });
}

async function openPrivacyReport(report: PrivacyReport, title: string): Promise<void> {
  if (!report.enabled) return;
  const lines: string[] = [
    `# ${title}`,
    "",
    `Total masked: ${report.totalMasked}`,
    ""
  ];
  if (Object.keys(report.byType).length > 0) {
    lines.push("## By type");
    for (const [key, value] of Object.entries(report.byType)) {
      lines.push(`- ${key}: ${value}`);
    }
    lines.push("");
  }
  if (report.files.length > 0) {
    lines.push("## Files");
    for (const item of report.files.slice(0, 200)) {
      lines.push(`- ${item.path}: ${item.masked}`);
    }
    if (report.files.length > 200) {
      lines.push(`- ...and ${report.files.length - 200} more`);
    }
  }

  const doc = await vscode.workspace.openTextDocument({
    content: lines.join("\n"),
    language: "markdown"
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

export function isNotebooklmUploadAvailable(config: ExportConfig): boolean {
  const enterprise = config.notebooklmEnterprise;
  if (!enterprise || !enterprise.enabled) return false;
  if (!enterprise.projectNumber || !enterprise.location || !enterprise.notebookId) return false;
  return Boolean(getNotebooklmAccessToken(enterprise));
}

function getNotebooklmAccessToken(enterprise: ExportConfig["notebooklmEnterprise"]): string {
  return enterprise.accessToken
    || process.env.NOTEBOOKLM_ACCESS_TOKEN
    || process.env.GOOGLE_OAUTH_ACCESS_TOKEN
    || "";
}

function normalizeEndpointLocation(value: string): string {
  if (!value) return "us-";
  if (value.endsWith("-")) return value;
  return `${value}-`;
}

function getNotebooklmUploadUrl(enterprise: ExportConfig["notebooklmEnterprise"]): string {
  const endpoint = `${normalizeEndpointLocation(enterprise.endpointLocation)}discoveryengine.googleapis.com`;
  const location = enterprise.location || "global";
  return `https://${endpoint}/upload/v1alpha/projects/${enterprise.projectNumber}/locations/${location}/notebooks/${enterprise.notebookId}/sources:uploadFile`;
}

function getNotebooklmContentType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".md") return "text/markdown";
  if (ext === ".txt") return "text/plain";
  return null;
}

async function tryUploadToNotebooklm(
  filePath: string,
  config: ExportConfig,
  log?: (message: string) => void
): Promise<void> {
  if (!isNotebooklmUploadAvailable(config)) {
    await notifyWarning(
      config,
      "NotebookLM upload is not configured. Set codeDump.notebooklmEnterprise settings to enable it."
    );
    log?.("NotebookLM upload skipped: not configured.");
    return;
  }

  const contentType = getNotebooklmContentType(filePath);
  if (!contentType) {
    await notifyWarning(config, "NotebookLM upload supports only .pdf, .md, or .txt files.");
    log?.("NotebookLM upload skipped: unsupported file type.");
    return;
  }

  const enterprise = config.notebooklmEnterprise;
  const accessToken = getNotebooklmAccessToken(enterprise);
  const uploadUrl = getNotebooklmUploadUrl(enterprise);
  const fileName = path.basename(filePath);
  const fileBuffer = await fs.readFile(filePath);
  log?.(`Uploading ${fileName} to NotebookLM...`);

  try {
    await vscode.window.withProgress(
      { location: getProgressLocation(config), title: "Uploading to NotebookLM...", cancellable: false },
      async () => {
        const result = await new Promise<{ name?: string }>((resolve, reject) => {
          const req = https.request(
            uploadUrl,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "X-Goog-Upload-File-Name": fileName,
                "X-Goog-Upload-Protocol": "raw",
                "Content-Type": contentType,
                "Content-Length": fileBuffer.length
              }
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                  try {
                    resolve(JSON.parse(data));
                  } catch {
                    resolve({});
                  }
                } else {
                  reject(new Error(data || `Upload failed (${res.statusCode})`));
                }
              });
            }
          );
          req.on("error", reject);
          req.write(fileBuffer);
          req.end();
        });

        if (result.name) {
          await notifyInfo(config, `NotebookLM upload completed: ${result.name}`);
          log?.(`NotebookLM upload completed: ${result.name}`);
        } else {
          await notifyInfo(config, "NotebookLM upload completed.");
          log?.("NotebookLM upload completed.");
        }
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await notifyError(config, `NotebookLM upload failed: ${message}`);
    log?.(`NotebookLM upload failed: ${message}`);
  }
}

```

## extension.ts

```ts
import * as vscode from "vscode";
import * as path from "path";
import { ServiceContainerFactory } from "./serviceContainer";
import { ExportPreset } from "./types";
import { showExportWebview } from "./webview";
import {
  buildFileSelectionSummary,
  isNotebooklmUploadAvailable,
  processFiles
} from "./exportWorkflow";

export function activate(context: vscode.ExtensionContext) {
  const services = ServiceContainerFactory.create();
  services.state.setContext(context);
  context.subscriptions.push({ dispose: () => ServiceContainerFactory.dispose() });

  const disposable = vscode.commands.registerCommand(
    "extension.exportCodeToText",
    async (uri?: vscode.Uri) => {
      const folderUri = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      // Refresh config on each export to pick up any changes
      ServiceContainerFactory.refreshConfig();
      const config = services.config.load();

      if (!folderUri) {
        if (config.showNotifications) {
          vscode.window.showErrorMessage("No folder selected.");
        }
        return;
      }

      // Get user selections
      const rawFiles = await services.fileSystem.getAllFiles(folderUri);
      const allExtensions = Array.from(
        new Set(rawFiles.map((f) => path.extname(f)).filter((e) => e))
      ).sort();

      const lastChoices = config.rememberLastChoice ? services.state.getLastChoices() : undefined;
      let presetExtensions: string[] | null = null;
      let presetTemplate: string | null = null;
      if (config.enablePresets) {
        const detectedType = await services.preset.detectProjectType(folderUri);
        if (detectedType) {
          const preset = services.preset.getPreset(detectedType);
          if (preset) {
            presetExtensions = preset.extensions;
            presetTemplate = preset.template;
          }
        }
      }
      const defaultFormat = lastChoices?.outputFormat || config.outputFormat;
      const defaultTemplate = lastChoices?.template
        || presetTemplate
        || (defaultFormat === ".txt" ? "default-txt" : "default-md");
      const defaultFileName = `${path.basename(folderUri)}-code${defaultFormat}`;
      const defaultOutputPath = lastChoices?.outputPath || path.join(folderUri, defaultFileName);

      const profiles = config.userProfiles || [];
      const selectedProfileId = lastChoices?.profileId
        && profiles.some((profile) => profile.id === lastChoices.profileId)
        ? lastChoices.profileId
        : "default";
      const notebooklmAvailable = isNotebooklmUploadAvailable(config);

      const session = await showExportWebview(context, {
        extensions: allExtensions,
        templates: services.template.getTemplateOptions(),
        preselectedExtensions: lastChoices?.extensions?.length
          ? lastChoices.extensions
          : (presetExtensions && presetExtensions.length > 0 ? presetExtensions : config.defaultExtensions),
        selectedTemplate: defaultTemplate,
        exportPreset: lastChoices?.preset || "standard",
        profiles,
        selectedProfileId,
        privacyModeEnabled: config.privacyMode.enabled,
        openAfterExport: lastChoices?.openAfterExport ?? config.openAfterExport,
        notebooklmUploadAvailable: notebooklmAvailable,
        notebooklmUploadEnabled: lastChoices?.notebooklmUpload ?? false,
        skipEmpty: lastChoices?.skipEmpty ?? (config.skipEmptyFiles === "exclude"),
        outputFormat: defaultFormat,
        defaultFileName,
        defaultOutputPath,
        showPreview: config.showPreview !== "never",
        dryRun: config.dryRun
      });
      if (!session) return;
      const userSelections = session.selections;
      const log = session.appendLog;
      log("Selections received.");

      const {
        selectedExtensions,
        skipEmpty,
        outputPath,
        showPreview,
        exportPreset,
        privacyModeEnabled,
        selectedProfileId: profileId,
        openAfterExport,
        notebooklmUploadEnabled
      } = userSelections;
      let { outputFormat } = userSelections;
      let { selectedTemplate } = userSelections;
      if (outputFormat === ".txt" && selectedTemplate === "default-md") selectedTemplate = "default-txt";
      if (outputFormat === ".md" && selectedTemplate === "default-txt") selectedTemplate = "default-md";
      if (outputFormat === ".pdf" && selectedTemplate === "default-txt") selectedTemplate = "default-md";
      if (exportPreset === "ai-pack") {
        selectedTemplate = "ai-ready";
        outputFormat = ".json";
      }

      if (config.rememberLastChoice) {
        await services.state.saveLastChoices({
          extensions: selectedExtensions,
          template: selectedTemplate,
          outputFormat,
          skipEmpty,
          preset: exportPreset,
          profileId,
          outputPath,
          openAfterExport,
          notebooklmUpload: notebooklmUploadEnabled
        });
      }

      // Load ignore files
      await Promise.all([
        services.filter.loadGitignore(folderUri),
        services.filter.loadCodedumpIgnore(folderUri, config.useCodedumpIgnore)
      ]);

      // Show status bar and start scanning
      services.statusBar.show();
      services.statusBar.setScanning();

      // Get and filter files
      const { filteredFiles, excludedFiles } = await buildFileSelectionSummary(
        services,
        rawFiles,
        folderUri,
        selectedExtensions,
        config.useSmartFilters,
        exportPreset
      );
      log(`Files matched: ${filteredFiles.length} (excluded: ${excludedFiles.length}).`);

      // Update status bar with file count
      services.statusBar.setIdle(filteredFiles.length);

      if (filteredFiles.length === 0) {
        services.statusBar.hide();
        log("No files matched the current filters.");
        if (config.showNotifications) {
          vscode.window.showWarningMessage(
            "No files matched the current filters. Check extensions, .gitignore/.codedumpignore, smart filters, or sensitive-file exclusions."
          );
        }
        return;
      }

      if (config.dryRun) {
        log(`Dry run enabled: ${filteredFiles.length} files would be processed.`);
        if (config.showNotifications) {
          vscode.window.showInformationMessage(
            `Dry run enabled: ${filteredFiles.length} files would be processed.`
          );
        }
        services.statusBar.hide();
        return;
      }

      // Show preview if enabled
      let finalFiles = filteredFiles;
      if (showPreview) {
        log("Showing file preview...");
        const previewResult = await showFilePreview(services, folderUri, filteredFiles);
        if (previewResult === null) {
          services.statusBar.hide();
          log("Export cancelled from preview.");
          return; // User cancelled
        }
        finalFiles = previewResult;
      }

      // Process files
      await processFiles(services, config, {
        folderUri,
        filteredFiles: finalFiles,
        selectedTemplate,
        skipEmpty,
        outputFormat,
        outputPath,
        exportPreset,
        excludedFiles,
        privacyModeEnabled,
        openAfterExport,
        notebooklmUploadEnabled,
        log
      });
    }
  );

  context.subscriptions.push(disposable);

  // CLI command
  const cliDisposable = vscode.commands.registerCommand("extension.exportCodeCLI", async () => {
    const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!folderUri) {
        if (services.config.load().showNotifications) {
          vscode.window.showErrorMessage("No workspace folder found.");
        }
        return;
      }
    await vscode.commands.executeCommand("extension.exportCodeToText", vscode.Uri.file(folderUri));
  });

  context.subscriptions.push(cliDisposable);
}

interface UserSelections {
  selectedExtensions: string[];
  selectedTemplate: string;
  exportPreset: ExportPreset;
  selectedProfileId: string;
  privacyModeEnabled: boolean;
  openAfterExport: boolean;
  notebooklmUploadEnabled: boolean;
  skipEmpty: boolean;
  outputFormat: string;
  outputPath: string;
  showPreview: boolean;
}

async function showFilePreview(
  services: ReturnType<typeof ServiceContainerFactory.create>,
  folderUri: string,
  files: string[]
): Promise<string[] | null> {
  // Calculate stats for preview
  let totalSize = 0;
  const fileItems: Array<{ label: string; description: string; detail: string; picked: boolean; filePath: string }> = [];

  for (const file of files) {
    try {
      const stats = await services.fileSystem.getFileStats(file);
      const relativePath = path.relative(folderUri, file);
      const sizeKB = (stats.size / 1024).toFixed(1);
      const tokens = Math.ceil(stats.size / 4);

      totalSize += stats.size;
      fileItems.push({
        label: `$(file) ${path.basename(file)}`,
        description: path.dirname(relativePath) === "." ? "" : path.dirname(relativePath),
        detail: `${sizeKB} KB | ~$2553 tokens`,
        picked: true,
        filePath: file
      });
    } catch {
      // Skip files that can't be read
    }
  }

  const totalSizeFormatted = totalSize < 1024 * 1024
    ? `${(totalSize / 1024).toFixed(1)} KB`
    : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
  const totalTokens = Math.ceil(totalSize / 4);
  const totalTokensFormatted = totalTokens < 1000
    ? totalTokens.toString()
    : totalTokens < 1000000
      ? `${(totalTokens / 1000).toFixed(1)}k`
      : `${(totalTokens / 1000000).toFixed(2)}M`;

  // Show preview with file selection
  const selected = await vscode.window.showQuickPick(fileItems, {
    canPickMany: true,
    title: `Preview: ${files.length} files | ${totalSizeFormatted} | ~${totalTokensFormatted} tokens`,
    placeHolder: "Uncheck files to exclude from export, then press Enter to continue"
  });

  if (!selected) return null;
  if (selected.length === 0) {
    if (services.config.load().showNotifications) {
      vscode.window.showWarningMessage("No files selected for export.");
    }
    return null;
  }

  return selected.map((item) => item.filePath);
}

export function deactivate() {}

```

## fileSystemService.ts

```ts
import * as fs from "fs/promises";
import * as path from "path";
import { IFileSystemService } from "./types";

export class FileSystemService implements IFileSystemService {
  async getAllFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      const files = entries
        .filter((file) => !file.isDirectory())
        .map((file) => path.join(dir, file.name));

      const folders = entries.filter((folder) => folder.isDirectory());
      const nested = await Promise.all(
        folders.map(async (folder) => {
          try {
            return await this.getAllFiles(path.join(dir, folder.name));
          } catch (error) {
            console.warn(`Failed to read directory ${folder.name}:`, error);
            return [];
          }
        })
      );

      return files.concat(...nested);
    } catch (error) {
      console.warn(`Failed to read directory ${dir}:`, error);
      return [];
    }
  }

  async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, "utf8");
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getFileStats(filePath: string): Promise<{ size: number; mtime: Date }> {
    const stats = await fs.stat(filePath);
    return { size: stats.size, mtime: stats.mtime };
  }
}

```

## filterService.ts

```ts
import * as path from "path";
import ignore, { Ignore } from "ignore";
import { IFileSystemService, IFilterService } from "./types";
import { SmartFilterManager } from "./smartFilters";

export class FilterService implements IFilterService {
  private gitignore: Ignore;
  private codedumpIgnore: Ignore;
  private smartFilterManager: SmartFilterManager | null = null;
  private sensitivePatterns: string[] = [];
  private excludeSensitive: boolean = true;

  constructor(private fileSystem: IFileSystemService) {
    this.gitignore = ignore();
    this.codedumpIgnore = ignore();
  }

  setSmartFilterManager(manager: SmartFilterManager): void {
    this.smartFilterManager = manager;
  }

  setSensitivePatterns(patterns: string[], enabled: boolean): void {
    this.sensitivePatterns = patterns;
    this.excludeSensitive = enabled;
  }

  async loadGitignore(folderUri: string): Promise<void> {
    const gitignorePath = path.join(folderUri, ".gitignore");
    this.gitignore = ignore();

    if (await this.fileSystem.fileExists(gitignorePath)) {
      const content = await this.fileSystem.readFile(gitignorePath);
      this.gitignore.add(content);
    }
  }

  async loadCodedumpIgnore(folderUri: string, enabled: boolean): Promise<void> {
    const codedumpIgnorePath = path.join(folderUri, ".codedumpignore");
    this.codedumpIgnore = ignore();

    if (enabled && await this.fileSystem.fileExists(codedumpIgnorePath)) {
      const content = await this.fileSystem.readFile(codedumpIgnorePath);
      this.codedumpIgnore.add(content);
    }
  }

  async shouldIncludeFile(
    filePath: string,
    basePath: string,
    extensions: string[],
    useSmartFilters: boolean
  ): Promise<boolean> {
    return await this.getExcludeReason(filePath, basePath, extensions, useSmartFilters) === null;
  }

  async getExcludeReason(
    filePath: string,
    basePath: string,
    extensions: string[],
    useSmartFilters: boolean
  ): Promise<string | null> {
    const relative = path.relative(basePath, filePath);
    const fileName = path.basename(filePath);

    if (!extensions.includes(path.extname(filePath))) {
      return "extension";
    }

    if (this.excludeSensitive && this.isSensitiveFile(fileName, relative)) {
      return "sensitive";
    }

    if (this.gitignore.ignores(relative)) {
      return "gitignore";
    }

    if (this.codedumpIgnore.ignores(relative)) {
      return "codedumpignore";
    }

    if (useSmartFilters && this.smartFilterManager) {
      const smartReason = await this.smartFilterManager.getExcludeReason(filePath, basePath);
      if (smartReason) return smartReason;
    }

    return null;
  }

  private isSensitiveFile(fileName: string, relativePath: string): boolean {
    for (const pattern of this.sensitivePatterns) {
      if (this.matchesPattern(fileName, pattern) || this.matchesPattern(relativePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  private matchesPattern(text: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\{content}") // Escape special regex chars except * and ?
      .replace(/\*/g, ".*") // * matches anything
      .replace(/\?/g, "."); // ? matches single char

    const regex = new RegExp(`^${regexPattern}

## filterService.ts

```ts
, "i");
    return regex.test(text);
  }
}

```

## pdf-lib.d.ts

```ts
declare module "pdf-lib" {
  export const StandardFonts: {
    Courier: string;
  };

  export class PDFDocument {
    static create(): Promise<PDFDocument>;
    embedFont(name: string): Promise<{ widthOfTextAtSize(text: string, size: number): number }>;
    addPage(size?: [number, number]): {
      drawText(text: string, options: { x: number; y: number; size: number; font: unknown }): void;
    };
    save(): Promise<Uint8Array>;
  }
}

```

## pdfExporter.ts

```ts
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as fs from "fs/promises";

export interface PdfExportOptions {
  fontSize?: number;
  margin?: number;
}

function wrapLine(
  line: string,
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  if (measure(line) <= maxWidth) return [line];
  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (measure(test) <= maxWidth) {
      current = test;
      continue;
    }
    if (current) lines.push(current);
    if (measure(word) > maxWidth) {
      const hardParts: string[] = [];
      let chunk = "";
      for (const char of word) {
        const testChunk = chunk + char;
        if (measure(testChunk) <= maxWidth) {
          chunk = testChunk;
        } else {
          if (chunk) hardParts.push(chunk);
          chunk = char;
        }
      }
      if (chunk) hardParts.push(chunk);
      lines.push(...hardParts);
      current = "";
    } else {
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export async function exportMarkdownToPdf(
  markdownContent: string,
  outputPath: string,
  options: PdfExportOptions = {}
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Courier);

  const fontSize = options.fontSize ?? 10;
  const margin = options.margin ?? 40;
  const pageWidth = 595.28;
  const pageHeight = 841.89;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const lines = markdownContent.split("\n");
  for (const rawLine of lines) {
    const isHeading = rawLine.trim().startsWith("#");
    const headingLevel = isHeading ? rawLine.match(/^#+/)?.[0].length || 1 : 0;
    const lineFontSize = isHeading ? Math.max(12, 16 - headingLevel) : fontSize;
    const lineHeight = lineFontSize + 4;
    const maxWidth = pageWidth - margin * 2;
    const measure = (text: string) => font.widthOfTextAtSize(text, lineFontSize);

    const wrapped = wrapLine(rawLine, maxWidth, measure);
    for (const line of wrapped) {
      if (y - lineHeight < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y: y - lineHeight, size: lineFontSize, font });
      y -= lineHeight;
    }
  }

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, pdfBytes);
}

```

## privacyMasker.ts

```ts
import { PrivacyModeConfig } from "./types";

export interface PrivacyMaskResult {
  maskedContent: string;
  totalMasked: number;
  byType: Record<string, number>;
}

interface ReplaceResult {
  output: string;
  count: number;
}

function replaceAndCount(
  input: string,
  regex: RegExp,
  replacer: string | ((match: string, ...groups: string[]) => string)
): ReplaceResult {
  let count = 0;
  const output = input.replace(regex, (...args) => {
    count += 1;
    if (typeof replacer === "string") return replacer;
    return replacer(args[0], ...args.slice(1));
  });
  return { output, count };
}

export function maskContent(content: string, config: PrivacyModeConfig): PrivacyMaskResult {
  if (!config.enabled) {
    return { maskedContent: content, totalMasked: 0, byType: {} };
  }

  const byType: Record<string, number> = {};
  let totalMasked = 0;
  let output = content;
  const placeholder = config.placeholder || "[REDACTED]";

  if (config.maskEmails) {
    const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
    const result = replaceAndCount(output, emailRegex, `${placeholder}_EMAIL`);
    output = result.output;
    byType.email = (byType.email || 0) + result.count;
    totalMasked += result.count;
  }

  if (config.maskApiKeys) {
    const apiKeyRegex = /\b(api[_-]?key|apikey|access[_-]?key|secret|client[_-]?secret)\b\s*[:=]\s*['"]?([A-Za-z0-9\-_=]{8,})['"]?/gi;
    const result = replaceAndCount(output, apiKeyRegex, (match, _label) => {
      return match.replace(/[:=].*$/, `: ${placeholder}_API_KEY`);
    });
    output = result.output;
    byType.apiKey = (byType.apiKey || 0) + result.count;
    totalMasked += result.count;
  }

  if (config.maskTokens) {
    const jwtRegex = /\beyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\b/g;
    const bearerRegex = /\bBearer\s+([A-Za-z0-9\-._~+/]+=*)/g;
    const genericTokenRegex = /\b(?:sk|rk|pk|ak|xoxb|xoxa|xoxp|xoxs|ghp|gho|ghu|ghs)[A-Za-z0-9_-]{8,}\b/gi;

    let result = replaceAndCount(output, jwtRegex, `${placeholder}_TOKEN`);
    output = result.output;
    byType.token = (byType.token || 0) + result.count;
    totalMasked += result.count;

    result = replaceAndCount(output, bearerRegex, (match) => {
      return match.replace(/Bearer\s+.*/, `Bearer ${placeholder}_TOKEN`);
    });
    output = result.output;
    byType.token = (byType.token || 0) + result.count;
    totalMasked += result.count;

    result = replaceAndCount(output, genericTokenRegex, `${placeholder}_TOKEN`);
    output = result.output;
    byType.token = (byType.token || 0) + result.count;
    totalMasked += result.count;
  }

  if (config.customPatterns && config.customPatterns.length > 0) {
    for (const pattern of config.customPatterns) {
      try {
        const regex = new RegExp(pattern, "g");
        const result = replaceAndCount(output, regex, `${placeholder}_CUSTOM`);
        output = result.output;
        if (result.count > 0) {
          byType.custom = (byType.custom || 0) + result.count;
          totalMasked += result.count;
        }
      } catch {
        // Ignore invalid regex patterns
      }
    }
  }

  return { maskedContent: output, totalMasked, byType };
}

```

## projectPresets.ts

```ts
import * as fs from "fs/promises";
import * as path from "path";
import { ProjectPreset } from "./types";

export class ProjectPresetManager {
  private presets: Map<string, ProjectPreset> = new Map();

  constructor() {
    this.initDefaultPresets();
  }

  private initDefaultPresets(): void {
    this.presets.set("react", {
      name: "React Project",
      extensions: [".tsx", ".ts", ".jsx", ".js", ".css", ".scss", ".json"],
      excludePaths: ["node_modules", "build", "dist", ".next", "coverage"],
      template: "with-metadata"
    });

    this.presets.set("node", {
      name: "Node.js Project",
      extensions: [".js", ".ts", ".json", ".md"],
      excludePaths: ["node_modules", "dist", "coverage", ".nyc_output"],
      template: "default-md"
    });

    this.presets.set("python", {
      name: "Python Project",
      extensions: [".py", ".pyx", ".pyi", ".txt", ".md", ".yml", ".yaml"],
      excludePaths: ["__pycache__", "venv", ".venv", "dist", "build", ".pytest_cache"],
      template: "with-metadata"
    });

    this.presets.set("vue", {
      name: "Vue Project",
      extensions: [".vue", ".js", ".ts", ".css", ".scss", ".json"],
      excludePaths: ["node_modules", "dist", ".nuxt", "coverage"],
      template: "compact"
    });

    this.presets.set("angular", {
      name: "Angular Project",
      extensions: [".ts", ".html", ".css", ".scss", ".json"],
      excludePaths: ["node_modules", "dist", ".angular", "coverage"],
      template: "with-metadata"
    });

    this.presets.set("flutter", {
      name: "Flutter Project",
      extensions: [".dart", ".yaml", ".yml"],
      excludePaths: ["build", ".dart_tool", ".packages"],
      template: "default-md"
    });

    this.presets.set("rust", {
      name: "Rust Project",
      extensions: [".rs", ".toml", ".md"],
      excludePaths: ["target", "Cargo.lock"],
      template: "with-metadata"
    });

    this.presets.set("go", {
      name: "Go Project",
      extensions: [".go", ".mod", ".sum", ".md"],
      excludePaths: ["vendor", "bin"],
      template: "default-md"
    });
  }

  async detectProjectType(folderPath: string): Promise<string | null> {
    try {
      const files = await fs.readdir(folderPath);
      
      // React/Next.js detection
      if (files.includes("package.json")) {
        const packagePath = path.join(folderPath, "package.json");
        const packageContent = JSON.parse(await fs.readFile(packagePath, "utf8"));
        const deps = { ...packageContent.dependencies, ...packageContent.devDependencies };
        
        if (deps.react) return "react";
        if (deps.vue) return "vue";
        if (deps["@angular/core"]) return "angular";
        return "node";
      }

      // Python detection
      if (files.some(f => ["requirements.txt", "setup.py", "pyproject.toml", "Pipfile"].includes(f))) {
        return "python";
      }

      // Flutter detection
      if (files.includes("pubspec.yaml")) {
        return "flutter";
      }

      // Rust detection
      if (files.includes("Cargo.toml")) {
        return "rust";
      }

      // Go detection
      if (files.includes("go.mod")) {
        return "go";
      }

      return null;
    } catch {
      return null;
    }
  }

  getPreset(key: string): ProjectPreset | undefined {
    return this.presets.get(key);
  }

  getAllPresets(): Array<{ key: string; preset: ProjectPreset }> {
    return Array.from(this.presets.entries()).map(([key, preset]) => ({ key, preset }));
  }

  addCustomPreset(key: string, preset: ProjectPreset): void {
    this.presets.set(key, preset);
  }
}

```

## serviceContainer.ts

```ts
import { ConfigService } from "./configService";
import { FileSystemService } from "./fileSystemService";
import { FilterService } from "./filterService";
import { SmartFilterManager } from "./smartFilters";
import { TemplateManager } from "./templateManager";
import { ProjectPresetManager } from "./projectPresets";
import { StatusBarManager } from "./statusBarManager";
import { StateService } from "./stateService";
import { ExportLogger } from "./exportLogger";
import { ChunkManager } from "./chunkManager";
import { IConfigService, IFileSystemService, IFilterService } from "./types";

export interface ServiceContainer {
  config: IConfigService;
  fileSystem: IFileSystemService;
  filter: IFilterService;
  template: TemplateManager;
  preset: ProjectPresetManager;
  statusBar: StatusBarManager;
  state: StateService;
}

export interface ExportManagers {
  logger: ExportLogger;
  chunk: ChunkManager;
}

export class ServiceContainerFactory {
  private static instance: ServiceContainer | null = null;

  static create(): ServiceContainer {
    if (this.instance) {
      return this.instance;
    }

    const fileSystem = new FileSystemService();
    const config = new ConfigService();
    const filter = new FilterService(fileSystem);

    // Configure filter managers
    const exportConfig = config.load();
    const smartFilterManager = new SmartFilterManager(exportConfig.smartFilters);
    filter.setSmartFilterManager(smartFilterManager);
    filter.setSensitivePatterns(exportConfig.sensitivePatterns, exportConfig.excludeSensitiveFiles);

    this.instance = {
      config,
      fileSystem,
      filter,
      template: new TemplateManager(),
      preset: new ProjectPresetManager(),
      statusBar: new StatusBarManager(),
      state: new StateService()
    };

    return this.instance;
  }

  static createExportManagers(
    outputPath: string,
    outputFormat: string,
    maxChunkSize: number
  ): ExportManagers {
    return {
      logger: new ExportLogger(),
      chunk: new ChunkManager(outputPath, outputFormat, maxChunkSize)
    };
  }

  static dispose(): void {
    if (this.instance) {
      this.instance.statusBar.dispose();
      this.instance = null;
    }
  }

  static refreshConfig(): void {
    if (this.instance) {
      // Re-create config service to pick up new settings
      this.instance.config = new ConfigService();

      // Update filter managers with new config
      const exportConfig = this.instance.config.load();
      const smartFilterManager = new SmartFilterManager(exportConfig.smartFilters);
      const filterService = this.instance.filter as FilterService;
      filterService.setSmartFilterManager(smartFilterManager);
      filterService.setSensitivePatterns(exportConfig.sensitivePatterns, exportConfig.excludeSensitiveFiles);
    }
  }
}

```

## smartFilters.ts

```ts
import * as fs from "fs/promises";
import * as path from "path";
import { SmartFilters } from "./types";

export class SmartFilterManager {
  private filters: SmartFilters;

  constructor(filters: SmartFilters) {
    this.filters = filters;
  }

  async shouldExcludeFile(filePath: string, basePath: string): Promise<boolean> {
    const relativePath = path.relative(basePath, filePath);
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch {
      return true;
    }
    
    // Check auto-exclude patterns
    for (const pattern of this.filters.autoExclude) {
      if (relativePath.includes(pattern)) return true;
    }

    // Check custom exclude patterns
    for (const pattern of this.filters.excludePatterns) {
      if (this.matchesPattern(relativePath, pattern)) return true;
    }

    // Check include patterns (if specified, file must match at least one)
    if (this.filters.includePatterns.length > 0) {
      const matches = this.filters.includePatterns.some(pattern => 
        this.matchesPattern(relativePath, pattern)
      );
      if (!matches) return true;
    }

    // Check file size
    if (this.filters.maxFileSize) {
      const maxBytes = this.parseFileSize(this.filters.maxFileSize);
      if (stats.size > maxBytes) return true;
    }

    // Check if binary (basic check)
    if (this.filters.skipBinaryFiles && await this.isBinaryFile(filePath)) {
      return true;
    }

    return false;
  }

  async getExcludeReason(filePath: string, basePath: string): Promise<string | null> {
    const relativePath = path.relative(basePath, filePath);
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch {
      return "stat-error";
    }

    for (const pattern of this.filters.autoExclude) {
      if (relativePath.includes(pattern)) return "auto-exclude";
    }

    for (const pattern of this.filters.excludePatterns) {
      if (this.matchesPattern(relativePath, pattern)) return "exclude-pattern";
    }

    if (this.filters.includePatterns.length > 0) {
      const matches = this.filters.includePatterns.some(pattern =>
        this.matchesPattern(relativePath, pattern)
      );
      if (!matches) return "include-pattern-miss";
    }

    if (this.filters.maxFileSize) {
      const maxBytes = this.parseFileSize(this.filters.maxFileSize);
      if (stats.size > maxBytes) return "max-file-size";
    }

    if (this.filters.skipBinaryFiles && await this.isBinaryFile(filePath)) {
      return "binary";
    }

    return null;
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    return regex.test(filePath);
  }

  private parseFileSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+)(KB|MB|GB)?$/i);
    if (!match) return Infinity;
    
    const size = parseInt(match[1]);
    const unit = (match[2] || '').toUpperCase();
    
    switch (unit) {
      case 'KB': return size * 1024;
      case 'MB': return size * 1024 * 1024;
      case 'GB': return size * 1024 * 1024 * 1024;
      default: return size;
    }
  }

  private async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      const buffer = await fs.readFile(filePath);
      const sample = buffer.slice(0, Math.min(512, buffer.length));
      return sample.some((byte) => byte === 0);
    } catch {
      return false;
    }
  }
}

```

## stateService.ts

```ts
import * as vscode from "vscode";
import { LastExportChoices } from "./types";

const STATE_KEY = "codeDump.lastExportChoices";

export class StateService {
  private context: vscode.ExtensionContext | null = null;

  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  getLastChoices(): LastExportChoices | undefined {
    if (!this.context) return undefined;
    return this.context.globalState.get<LastExportChoices>(STATE_KEY);
  }

  async saveLastChoices(choices: LastExportChoices): Promise<void> {
    if (!this.context) return;
    await this.context.globalState.update(STATE_KEY, choices);
  }

  async clearLastChoices(): Promise<void> {
    if (!this.context) return;
    await this.context.globalState.update(STATE_KEY, undefined);
  }
}

```

## statusBarManager.ts

```ts
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

```

## templateManager.ts

```ts
import * as path from "path";
import * as fs from "fs";
import { ExportTemplate } from "./types";

export class TemplateManager {
  private templates: Map<string, ExportTemplate> = new Map();

  constructor() {
    this.initDefaultTemplates();
  }

  private initDefaultTemplates(): void {
    this.templates.set("default-md", {
      name: "Default Markdown",
      pattern: "\n\n## {relativePath}\n\n```ts\n{content}\n```",
      withMetadata: false
    });

    this.templates.set("default-txt", {
      name: "Default Text",
      pattern: "\n\n================ {relativePath} ================\n\n{content}",
      withMetadata: false
    });

    this.templates.set("with-metadata", {
      name: "With Metadata",
      pattern: "\n\n## {relativePath}\n**Lines:** 95 | **Size:** 2918 bytes | **Modified:** 2026-01-29\n\n```ts\n{content}\n```",
      withMetadata: true
    });

    this.templates.set("compact", {
      name: "Compact",
      pattern: "\n\n### {relativePath} (95L)\n```ts\n{content}\n```",
      withMetadata: true
    });

    this.templates.set("ai-ready", {
      name: "AI Ready",
      pattern: "\n\n<!-- FILE: {relativePath} -->\n<!-- TOKENS: ~730 -->\n```ts\n{content}\n```",
      withMetadata: true
    });
  }

  formatContent(
    templateKey: string,
    relativePath: string,
    content: string,
    filePath: string,
    outputFormat: string
  ): string {
    const template = this.templates.get(templateKey) || this.getDefaultTemplate(outputFormat);
    
    const stats = fs.statSync(filePath);
    const lines = content.split('\n').length;
    const tokens = this.estimateTokens(content);
    const extension = path.extname(filePath).replace(".", "");
    
    return template.pattern
      .replace(/{relativePath}/g, relativePath)
      .replace(/{content}/g, content)
      .replace(/ts/g, extension)
      .replace(/95/g, lines.toString())
      .replace(/2918/g, stats.size.toString())
      .replace(/730/g, tokens.toString())
      .replace(/2026-01-29/g, stats.mtime.toISOString().split('T')[0]);
  }

  private getDefaultTemplate(outputFormat: string): ExportTemplate {
    return outputFormat === ".md" ? 
      this.templates.get("default-md")! : 
      this.templates.get("default-txt")!;
  }

  private estimateTokens(content: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  getTemplateNames(): string[] {
    return Array.from(this.templates.keys());
  }

  getTemplateOptions(): Array<{ key: string; name: string; withMetadata: boolean }> {
    return Array.from(this.templates.entries()).map(([key, template]) => ({
      key,
      name: template.name,
      withMetadata: template.withMetadata
    }));
  }

  addCustomTemplate(key: string, template: ExportTemplate): void {
    this.templates.set(key, template);
  }
}

```

## types.ts

```ts
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

```

## webview.ts

```ts
import * as vscode from "vscode";
import * as path from "path";

export interface TemplateOption {
  key: string;
  name: string;
  withMetadata: boolean;
}

export interface WebviewInitData {
  extensions: string[];
  templates: TemplateOption[];
  preselectedExtensions: string[];
  selectedTemplate: string;
  exportPreset: "standard" | "ai-pack";
  profiles: Array<{
    id: string;
    name: string;
    extensions?: string[];
    template?: string;
    outputFormat?: string;
    skipEmpty?: boolean;
    showPreview?: boolean;
    exportPreset?: "standard" | "ai-pack";
    privacyModeEnabled?: boolean;
  }>;
  selectedProfileId: string;
  privacyModeEnabled: boolean;
  openAfterExport: boolean;
  notebooklmUploadAvailable: boolean;
  notebooklmUploadEnabled: boolean;
  skipEmpty: boolean;
  outputFormat: string;
  defaultFileName: string;
  defaultOutputPath: string;
  showPreview: boolean;
  dryRun: boolean;
}

export interface WebviewSelections {
  selectedExtensions: string[];
  selectedTemplate: string;
  exportPreset: "standard" | "ai-pack";
  selectedProfileId: string;
  privacyModeEnabled: boolean;
  openAfterExport: boolean;
  notebooklmUploadEnabled: boolean;
  skipEmpty: boolean;
  outputFormat: string;
  outputPath: string;
  showPreview: boolean;
}

export interface WebviewSession {
  selections: WebviewSelections;
  appendLog: (message: string) => void;
  dispose: () => void;
}

class WebviewPanelManager {
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private resolved = false;

  constructor(
    private context: vscode.ExtensionContext,
    private initData: WebviewInitData,
    private resolve: (value: WebviewSession | null) => void
  ) {
    this.panel = this.createPanel();
    this.attachListeners();
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      "codeDumpExport",
      "Code Dump Export",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
      }
    );

    const nonce = getNonce();
    panel.webview.html = buildWebviewHtml(panel.webview, this.context.extensionUri, this.initData, nonce);

    return panel;
  }

  private attachListeners(): void {
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(async (message) => {
        if (!message || typeof message.type !== "string") return;

        switch (message.type) {
          case "cancel":
            this.dispose();
            this.resolve(null);
            return;
          case "chooseOutput": {
            const outputFormat = message.outputFormat || this.initData.outputFormat;
            const filterName = outputFormat === ".md"
              ? "Markdown"
              : outputFormat === ".json"
                ? "JSON"
                : outputFormat === ".pdf"
                  ? "PDF"
                  : "Text";
            const defaultPath = message.defaultPath || this.initData.defaultOutputPath;
            const outputUri = await vscode.window.showSaveDialog({
              defaultUri: vscode.Uri.file(defaultPath),
              filters: { [filterName]: [outputFormat.replace(".", "")] }
            });

            if (outputUri) {
              this.panel.webview.postMessage({ type: "outputChosen", outputPath: outputUri.fsPath });
            }
            return;
          }
          case "copyPath": {
            const targetPath = typeof message.outputPath === "string"
              ? message.outputPath
              : this.initData.defaultOutputPath;
            await vscode.env.clipboard.writeText(targetPath);
            this.panel.webview.postMessage({ type: "copiedPath" });
            return;
          }
          case "submit": {
            const selectedExtensions = Array.isArray(message.selectedExtensions)
              ? message.selectedExtensions.filter((e: unknown) => typeof e === "string")
              : [];

            if (selectedExtensions.length === 0) {
              this.panel.webview.postMessage({
                type: "error",
                message: "Select at least one file extension."
              });
              return;
            }

            const selections: WebviewSelections = {
              selectedExtensions,
              selectedTemplate: typeof message.selectedTemplate === "string"
                ? message.selectedTemplate
                : this.initData.selectedTemplate,
              exportPreset: message.exportPreset === "ai-pack" ? "ai-pack" : "standard",
              selectedProfileId: typeof message.selectedProfileId === "string"
                ? message.selectedProfileId
                : this.initData.selectedProfileId,
              privacyModeEnabled: Boolean(message.privacyModeEnabled),
              openAfterExport: Boolean(message.openAfterExport),
              notebooklmUploadEnabled: Boolean(message.notebooklmUploadEnabled),
              skipEmpty: Boolean(message.skipEmpty),
              outputFormat: typeof message.outputFormat === "string"
                ? message.outputFormat
                : this.initData.outputFormat,
              outputPath: typeof message.outputPath === "string"
                ? message.outputPath
                : this.initData.defaultOutputPath,
              showPreview: Boolean(message.showPreview)
            };

            if (!this.initData.dryRun && (!selections.outputPath || selections.outputPath.trim().length === 0)) {
              this.panel.webview.postMessage({
                type: "error",
                message: "Choose an output path."
              });
              return;
            }

            this.panel.webview.postMessage({ type: "setExporting", exporting: true });
            if (!this.resolved) {
              this.resolved = true;
              this.resolve({
                selections,
                appendLog: (message: string) => this.appendLog(message),
                dispose: () => this.panel.dispose()
              });
            }
            return;
          }
        }
      })
    );

    this.panel.onDidDispose(() => {
      this.dispose();
      if (!this.resolved) this.resolve(null);
    }, null, this.disposables);
  }

  private appendLog(message: string): void {
    this.panel.webview.postMessage({ type: "appendLog", message });
  }

  private dispose(): void {
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
}

export async function showExportWebview(
  context: vscode.ExtensionContext,
  initData: WebviewInitData
): Promise<WebviewSession | null> {
  return new Promise((resolve) => {
    new WebviewPanelManager(context, initData, resolve);
  });
}

function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  initData: WebviewInitData,
  nonce: string
): string {
  const data = encodeURIComponent(JSON.stringify(initData));
  const mediaRoot = vscode.Uri.joinPath(extensionUri, "media");
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "style.css"));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "main.js"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Dump Export</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body data-init="${data}">
  <h1>Code Dump Export</h1>

  <div class="section">
    <div class="row row-between">
      <strong>File extensions</strong>
      <div class="row">
        <button id="selectAll" class="secondary">Select all</button>
        <button id="clearAll" class="secondary">Clear</button>
      </div>
    </div>
    <div class="extensions" id="extensionsList"></div>
  </div>

  <div class="section">
    <div class="row gap-16">
      <div class="field-block">
        <label>Profile</label>
        <select id="profileSelect"></select>
        <div class="muted mt-4" id="profileHint"></div>
      </div>
      <div class="field-block">
        <label>Preset</label>
        <select id="presetSelect">
          <option value="standard">Standard</option>
          <option value="ai-pack">AI Export Pack</option>
        </select>
        <div class="muted mt-4" id="presetHint"></div>
      </div>
      <div class="field-block field-block--wide">
        <label>Template</label>
        <select id="templateSelect"></select>
      </div>
      <div class="field-block field-block--narrow">
        <label>Output format</label>
        <select id="formatSelect">
          <option value=".md">.md</option>
          <option value=".txt">.txt</option>
          <option value=".json">.json</option>
          <option value=".pdf">.pdf</option>
        </select>
      </div>
    </div>

    <div class="row mt-8">
      <label><input type="checkbox" id="skipEmpty"> Exclude empty files</label>
      <label><input type="checkbox" id="showPreview"> Preview files before export</label>
      <label><input type="checkbox" id="privacyMode"> Privacy mode (mask sensitive)</label>
      <label><input type="checkbox" id="openAfterExport"> Open file after export</label>
      <label><input type="checkbox" id="notebooklmUpload"> Upload to NotebookLM (Enterprise)</label>
      <span class="muted" id="notebooklmHint"></span>
      <span class="muted hidden" id="dryRunBadge">Dry run enabled<span class="pill">no file will be written</span></span>
    </div>
  </div>

  <div class="section" id="outputSection">
    <div class="path-row">
      <div>
        <label>Output path</label>
        <input type="text" id="outputPath" readonly>
      </div>
      <div>
        <button id="choosePath">Choose…</button>
      </div>
      <div>
        <button id="copyPath" class="secondary">Copy</button>
      </div>
    </div>
  </div>

  <div class="error" id="errorBox"></div>

  <div class="section">
    <div class="row row-between">
      <strong>Operation log</strong>
      <span class="muted" id="logStatus">Idle</span>
    </div>
    <textarea id="logOutput" class="log-box" readonly></textarea>
  </div>

  <div class="actions">
    <button id="cancelBtn" class="secondary">Cancel</button>
    <button id="exportBtn">Export</button>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

```

## __tests__/contextOptimizer.test.ts

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { ContextOptimizer } from "../contextOptimizer";
import { AiContextOptimizerConfig } from "../types";

const baseConfig: AiContextOptimizerConfig = {
  enabled: true,
  maxTokenBudget: 100000,
  removeComments: true,
  removeDocstrings: true,
  minifyWhitespace: true,
  truncateLargeFiles: true,
  maxLinesPerFile: 2,
  prioritizeRecentFiles: true
};

test("ContextOptimizer removes comments, minifies whitespace, and truncates", () => {
  const optimizer = new ContextOptimizer(baseConfig);
  const content = [
    "const a = 1; // comment",
    "",
    "/* block */",
    "const b = 2;",
    "",
    "",
    "const c = 3;"
  ].join("\n");

  const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
  const lines = optimized.split("\n");
  const nonEmpty = lines.filter((line) => line.trim().length > 0);

  assert.ok(lines.length >= 4);
  assert.ok(nonEmpty.includes("const a = 1;"));
  assert.match(optimized, /truncated/);

  const stats = optimizer.getStats(100, 80);
  assert.equal(stats.truncatedFiles.length, 1);
  assert.ok(stats.commentsRemoved > 0);
});

test("ContextOptimizer returns original content when disabled", () => {
  const optimizer = new ContextOptimizer({ ...baseConfig, enabled: false });
  const content = "const x = 1;\n";
  const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
  assert.equal(optimized, content);
});

test("ContextOptimizer preserves URLs inside strings", () => {
  const optimizer = new ContextOptimizer({
    ...baseConfig,
    removeDocstrings: false,
    minifyWhitespace: false,
    truncateLargeFiles: false
  });
  const content = [
    "const url = \"https://example.com/path\"; // trailing",
    "const other = 'http://example.org/test';",
    "const templ = `https://example.com/${id}`;"
  ].join("\n");

  const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
  assert.match(optimized, /https:\/\/example\.com\/path/);
  assert.match(optimized, /http:\/\/example\.org\/test/);
  assert.match(optimized, /`https:\/\/example\.com\//);
  assert.ok(!optimized.includes("// trailing"));
});

test("ContextOptimizer preserves JS doc comments when configured", () => {
  const optimizer = new ContextOptimizer({
    ...baseConfig,
    removeDocstrings: false,
    minifyWhitespace: false,
    truncateLargeFiles: false
  });
  const content = [
    "/** docs */",
    "const a = 1;",
    "// inline",
    "const b = 2;"
  ].join("\n");

  const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
  assert.ok(optimized.includes("/** docs */"));
  assert.ok(!optimized.includes("// inline"));
});

test("ContextOptimizer removes doc comments when enabled", () => {
  const optimizer = new ContextOptimizer({
    ...baseConfig,
    removeComments: false,
    removeDocstrings: true,
    minifyWhitespace: false,
    truncateLargeFiles: false
  });
  const content = [
    "/** docs */",
    "const a = 1;",
    "// regular",
    "const b = 2;"
  ].join("\n");

  const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
  assert.ok(!optimized.includes("/** docs */"));
  assert.ok(optimized.includes("// regular"));
});

test("ContextOptimizer removes Python docstrings", () => {
  const optimizer = new ContextOptimizer({
    ...baseConfig,
    removeComments: false,
    removeDocstrings: true,
    minifyWhitespace: false,
    truncateLargeFiles: false
  });
  const content = [
    "\"\"\"Module docs\"\"\"",
    "",
    "def foo():",
    "    \"\"\"Func docs\"\"\"",
    "    return 1"
  ].join("\n");

  const optimized = optimizer.optimizeContent(content, "src/module.py", "py");
  assert.ok(!optimized.includes("Module docs"));
  assert.ok(!optimized.includes("Func docs"));
});

```

## __tests__/dependencyAnalyzer.test.ts

```ts
import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DependencyAnalyzer } from "../dependencyAnalyzer";
import { AliasResolver } from "../aliasResolver";

test("DependencyAnalyzer builds edges for local imports", () => {
  const analyzer = new DependencyAnalyzer("/repo");

  analyzer.addFile("src/index.ts", "import './utils';\nimport './types';\n");
  analyzer.addFile("src/utils.ts", "import './types';\n");
  analyzer.addFile("src/types.ts", "export type X = string;\n");

  const graph = analyzer.analyze();

  assert.deepEqual(graph.nodes.sort(), [
    "src/index.ts",
    "src/types.ts",
    "src/utils.ts"
  ]);

  const edges = graph.edges.map((edge) => `${edge.from}->${edge.to}`).sort();
  assert.deepEqual(edges, [
    "src/index.ts->src/types.ts",
    "src/index.ts->src/utils.ts",
    "src/utils.ts->src/types.ts"
  ]);
});

test("DependencyAnalyzer resolves alias imports from tsconfig paths", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-exporter-alias-"));
  const tsconfigPath = path.join(tempDir, "tsconfig.json");
  fs.writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@utils/*": ["src/utils/*"]
        }
      }
    }),
    "utf8"
  );

  const aliasResolver = new AliasResolver({ basePath: tempDir, configPath: tsconfigPath });
  const analyzer = new DependencyAnalyzer(tempDir, aliasResolver);

  analyzer.addFile("src/index.ts", "import logger from '@utils/logger';\n");
  analyzer.addFile("src/utils/logger.ts", "export const logger = () => null;\n");

  const graph = analyzer.analyze();
  const edges = graph.edges.map((edge) => `${edge.from}->${edge.to}`);

  assert.deepEqual(edges, ["src/index.ts->src/utils/logger.ts"]);
});

```

## __tests__/exportOptimization.test.ts

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  prioritizeFiles,
  optimizeContent,
  wouldExceedBudget
} from "../exportOptimization";
import { ContextOptimizer } from "../contextOptimizer";
import { AiContextOptimizerConfig } from "../types";

test("prioritizeFiles favors entry points over recency", async () => {
  const files = [
    "/repo/src/feature.ts",
    "/repo/src/index.ts",
    "/repo/README.md"
  ];
  const stats = new Map<string, Date>([
    ["/repo/src/feature.ts", new Date("2025-01-01T00:00:00Z")],
    ["/repo/src/index.ts", new Date("2024-01-01T00:00:00Z")],
    ["/repo/README.md", new Date("2026-01-01T00:00:00Z")]
  ]);

  const ordered = await prioritizeFiles(
    files,
    "/repo",
    async (filePath) => ({ mtime: stats.get(filePath) ?? new Date(0) }),
    true
  );

  assert.equal(ordered[0], "/repo/src/index.ts");
});

test("prioritizeFiles uses recency when scores match", async () => {
  const files = ["/repo/src/a.ts", "/repo/src/b.ts"];
  const stats = new Map<string, Date>([
    ["/repo/src/a.ts", new Date("2024-01-01T00:00:00Z")],
    ["/repo/src/b.ts", new Date("2025-01-01T00:00:00Z")]
  ]);

  const ordered = await prioritizeFiles(
    files,
    "/repo",
    async (filePath) => ({ mtime: stats.get(filePath) ?? new Date(0) }),
    true
  );

  assert.deepEqual(ordered, ["/repo/src/b.ts", "/repo/src/a.ts"]);
});

test("optimizeContent uses optimizer when provided", () => {
  const config: AiContextOptimizerConfig = {
    enabled: true,
    maxTokenBudget: 100000,
    removeComments: true,
    removeDocstrings: true,
    minifyWhitespace: true,
    truncateLargeFiles: false,
    maxLinesPerFile: 500,
    prioritizeRecentFiles: true
  };
  const optimizer = new ContextOptimizer(config);
  const result = optimizeContent(
    "const a = 1; // comment\n",
    "src/index.ts",
    "ts",
    optimizer
  );

  assert.equal(result.optimizedContent.trim(), "const a = 1;");
  assert.ok(result.optimizedTokens <= result.originalTokens);
});

test("wouldExceedBudget reports budget overflow", () => {
  assert.equal(wouldExceedBudget(90, 15, 100), true);
  assert.equal(wouldExceedBudget(90, 10, 100), false);
});

```

## __tests__/filterService.test.ts

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { FilterService } from "../filterService";
import { IFileSystemService } from "../types";

function createFileSystemMock(): IFileSystemService {
  return {
    getAllFiles: async () => [],
    readFile: async (filePath: string) => {
      if (filePath.endsWith(".gitignore")) return "notes.txt\n";
      if (filePath.endsWith(".codedumpignore")) return "ignored.md\n";
      return "";
    },
    fileExists: async (filePath: string) => filePath.endsWith(".gitignore") || filePath.endsWith(".codedumpignore"),
    getFileStats: async () => ({ size: 1, mtime: new Date() })
  };
}

test("FilterService returns exclusion reasons in the right order", async () => {
  const fileSystem = createFileSystemMock();
  const filter = new FilterService(fileSystem);
  const basePath = "/repo";

  filter.setSensitivePatterns(["*.env", "*.secret"], true);
  await filter.loadGitignore(basePath);
  await filter.loadCodedumpIgnore(basePath, true);

  const extensions = [".md", ".txt", ".env"];

  assert.equal(
    await filter.getExcludeReason("/repo/file.env", basePath, extensions, false),
    "sensitive"
  );
  assert.equal(
    await filter.getExcludeReason("/repo/notes.txt", basePath, extensions, false),
    "gitignore"
  );
  assert.equal(
    await filter.getExcludeReason("/repo/ignored.md", basePath, extensions, false),
    "codedumpignore"
  );
  assert.equal(
    await filter.getExcludeReason("/repo/README.js", basePath, extensions, false),
    "extension"
  );
  assert.equal(
    await filter.getExcludeReason("/repo/README.md", basePath, extensions, false),
    null
  );
});

```

## __tests__/privacyMasker.test.ts

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { maskContent } from "../privacyMasker";
import { PrivacyModeConfig } from "../types";

const baseConfig: PrivacyModeConfig = {
  enabled: true,
  maskEmails: true,
  maskTokens: true,
  maskApiKeys: true,
  placeholder: "[REDACTED]",
  customPatterns: []
};

test("maskContent masks emails, tokens, and api keys with counts", () => {
  const content = [
    "email: test@example.com",
    "apiKey: abcdefghijkl",
    "Authorization: Bearer abc.def.ghi",
    "jwt=eyJabc.def.ghi",
    "ghp1234567890",
    "password=supersecret"
  ].join("\n");

  const config: PrivacyModeConfig = {
    ...baseConfig,
    customPatterns: ["password\\s*[:=]\\s*\\S+"]
  };

  const result = maskContent(content, config);

  assert.match(result.maskedContent, /\[REDACTED\]_EMAIL/);
  assert.match(result.maskedContent, /\[REDACTED\]_API_KEY/);
  assert.match(result.maskedContent, /Bearer \[REDACTED\]_TOKEN/);
  assert.match(result.maskedContent, /\[REDACTED\]_TOKEN/);
  assert.match(result.maskedContent, /\[REDACTED\]_CUSTOM/);

  assert.equal(result.byType.email, 1);
  assert.equal(result.byType.apiKey, 1);
  assert.ok((result.byType.token || 0) >= 2);
  assert.equal(result.byType.custom, 1);
  assert.ok(result.totalMasked >= 5);
});

test("maskContent returns original content when disabled", () => {
  const content = "email: test@example.com";
  const result = maskContent(content, { ...baseConfig, enabled: false });
  assert.equal(result.maskedContent, content);
  assert.equal(result.totalMasked, 0);
  assert.deepEqual(result.byType, {});
});

```