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
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars except * and ?
      .replace(/\*/g, ".*") // * matches anything
      .replace(/\?/g, "."); // ? matches single char

    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(text);
  }
}
