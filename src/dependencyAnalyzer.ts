import * as path from "path";
import { DependencyGraph, DependencyEdge } from "./types";

export class DependencyAnalyzer {
  private basePath: string;
  private fileContents: Map<string, string>;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.fileContents = new Map();
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
    // Local imports start with . or .. or are relative paths
    return importPath.startsWith(".") || importPath.startsWith("/");
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
      let resolved = path.normalize(path.join(fromDir, depPath));

      // Try exact match first
      if (this.fileContents.has(resolved)) {
        return resolved;
      }

      // Try adding common extensions
      const extensions = [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".py", ".go", ".rs"];
      for (const ext of extensions) {
        if (this.fileContents.has(resolved + ext)) {
          return resolved + ext;
        }
      }

      // Try index files
      for (const ext of extensions) {
        const indexPath = path.join(resolved, `index${ext}`);
        if (this.fileContents.has(indexPath)) {
          return indexPath;
        }
      }
    }

    return null;
  }

  clear(): void {
    this.fileContents.clear();
  }
}
