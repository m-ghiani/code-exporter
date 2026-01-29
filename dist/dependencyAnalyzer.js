"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyAnalyzer = void 0;
const path = __importStar(require("path"));
class DependencyAnalyzer {
    basePath;
    fileContents;
    constructor(basePath) {
        this.basePath = basePath;
        this.fileContents = new Map();
    }
    addFile(relativePath, content) {
        this.fileContents.set(relativePath, content);
    }
    analyze() {
        const nodes = Array.from(this.fileContents.keys());
        const edges = [];
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
    extractDependencies(content, filePath, extension) {
        const deps = [];
        switch (extension) {
            case "js":
            case "jsx":
            case "ts":
            case "tsx":
            case "mjs":
            case "cjs":
                // ES6 imports: import x from 'path' or import 'path'
                const importMatches = content.matchAll(/import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g);
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
                const reexportMatches = content.matchAll(/export\s+(?:(?:\*|{[^}]*})\s+from\s+)['"]([^'"]+)['"]/g);
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
    isLocalImport(importPath) {
        // Local imports start with . or .. or are relative paths
        return importPath.startsWith(".") || importPath.startsWith("/");
    }
    isPythonStdLib(moduleName) {
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
    resolveDependency(depPath, fromFile) {
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
    clear() {
        this.fileContents.clear();
    }
}
exports.DependencyAnalyzer = DependencyAnalyzer;
//# sourceMappingURL=dependencyAnalyzer.js.map