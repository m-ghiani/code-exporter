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
