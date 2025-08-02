import * as fs from "fs";
import * as path from "path";
import { SmartFilters } from "./types";

export class SmartFilterManager {
  private filters: SmartFilters;

  constructor(filters: SmartFilters) {
    this.filters = filters;
  }

  shouldExcludeFile(filePath: string, basePath: string): boolean {
    const relativePath = path.relative(basePath, filePath);
    const stats = fs.statSync(filePath);
    
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
    if (this.filters.skipBinaryFiles && this.isBinaryFile(filePath)) {
      return true;
    }

    return false;
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

  private isBinaryFile(filePath: string): boolean {
    try {
      const buffer = fs.readFileSync(filePath, { encoding: null });
      const sample = buffer.slice(0, Math.min(512, buffer.length));
      return sample.some(byte => byte === 0);
    } catch {
      return false;
    }
  }
}