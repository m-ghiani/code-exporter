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

  loadGitignore(folderUri: string): void {
    const gitignorePath = path.join(folderUri, ".gitignore");
    this.gitignore = ignore();

    if (this.fileSystem.fileExists(gitignorePath)) {
      const content = this.fileSystem.readFile(gitignorePath);
      this.gitignore.add(content);
    }
  }

  loadCodedumpIgnore(folderUri: string, enabled: boolean): void {
    const codedumpIgnorePath = path.join(folderUri, ".codedumpignore");
    this.codedumpIgnore = ignore();

    if (enabled && this.fileSystem.fileExists(codedumpIgnorePath)) {
      const content = this.fileSystem.readFile(codedumpIgnorePath);
      this.codedumpIgnore.add(content);
    }
  }

  shouldIncludeFile(
    filePath: string,
    basePath: string,
    extensions: string[],
    useSmartFilters: boolean
  ): boolean {
    const relative = path.relative(basePath, filePath);
    const fileName = path.basename(filePath);

    // Extension filter
    if (!extensions.includes(path.extname(filePath))) {
      return false;
    }

    // Sensitive files filter
    if (this.excludeSensitive && this.isSensitiveFile(fileName, relative)) {
      return false;
    }

    // Gitignore filter
    if (this.gitignore.ignores(relative)) {
      return false;
    }

    // Codedumpignore filter
    if (this.codedumpIgnore.ignores(relative)) {
      return false;
    }

    // Smart filters
    if (useSmartFilters && this.smartFilterManager?.shouldExcludeFile(filePath, basePath)) {
      return false;
    }

    return true;
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
