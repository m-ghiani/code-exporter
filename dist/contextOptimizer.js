"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextOptimizer = void 0;
class ContextOptimizer {
    config;
    commentsRemoved = 0;
    docstringsRemoved = 0;
    truncatedFiles = [];
    constructor(config) {
        this.config = config;
    }
    optimizeContent(content, filePath, extension) {
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
    removeComments(content, extension, preserveDocstrings) {
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
    removeDocstrings(content, extension) {
        const originalLength = content.length;
        let result = content;
        let removedCount = 0;
        switch (extension) {
            case "py": {
                const moduleDocstring = /^\s*("""|''')[\s\S]*?\1\s*\n?/;
                const functionDocstring = /(^\s*(def|class)\s+[\w_]+[^\n]*:\s*\n)(\s*)("""|''')[\s\S]*?\4/gm;
                const moduleMatch = result.match(moduleDocstring);
                if (moduleMatch)
                    removedCount += 1;
                result = result.replace(moduleDocstring, "");
                const funcMatches = result.match(functionDocstring);
                if (funcMatches)
                    removedCount += funcMatches.length;
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
    stripCStyleComments(content, options) {
        let result = "";
        let inSingle = false;
        let inDouble = false;
        let inTemplate = false;
        let blockMode = null;
        let lineMode = null;
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const next = content[i + 1];
            if (lineMode) {
                if (char === "\n") {
                    lineMode = null;
                    result += char;
                }
                else if (lineMode === "preserve") {
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
                }
                else if (blockMode === "preserve") {
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
                if (char === "'")
                    inSingle = false;
                continue;
            }
            if (inDouble) {
                result += char;
                if (char === "\\" && next) {
                    result += next;
                    i++;
                    continue;
                }
                if (char === '"')
                    inDouble = false;
                continue;
            }
            if (inTemplate) {
                result += char;
                if (char === "\\" && next) {
                    result += next;
                    i++;
                    continue;
                }
                if (char === "`")
                    inTemplate = false;
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
                }
                else {
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
                }
                else {
                    blockMode = "remove";
                }
                i++;
                continue;
            }
            result += char;
        }
        return result;
    }
    stripCStyleDocComments(content) {
        let result = "";
        let inSingle = false;
        let inDouble = false;
        let inTemplate = false;
        let blockMode = null;
        let lineMode = null;
        let removedCount = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const next = content[i + 1];
            if (lineMode) {
                if (char === "\n") {
                    lineMode = null;
                    result += char;
                }
                else if (lineMode === "preserve") {
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
                }
                else if (blockMode === "preserve") {
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
                if (char === "'")
                    inSingle = false;
                continue;
            }
            if (inDouble) {
                result += char;
                if (char === "\\" && next) {
                    result += next;
                    i++;
                    continue;
                }
                if (char === '"')
                    inDouble = false;
                continue;
            }
            if (inTemplate) {
                result += char;
                if (char === "\\" && next) {
                    result += next;
                    i++;
                    continue;
                }
                if (char === "`")
                    inTemplate = false;
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
                }
                else {
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
                }
                else {
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
    stripHashComments(content, options) {
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
            }
            else if (char.trim().length > 0) {
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
                if (char === "'")
                    inSingle = false;
                continue;
            }
            if (inDouble) {
                result += char;
                if (char === "\\" && next) {
                    result += next;
                    i++;
                    continue;
                }
                if (char === '"')
                    inDouble = false;
                continue;
            }
            if (inBacktick) {
                result += char;
                if (char === "\\" && next) {
                    result += next;
                    i++;
                    continue;
                }
                if (char === "`")
                    inBacktick = false;
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
    stripSqlComments(content) {
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
    stripGoDocComments(content, onRemoved) {
        const docPattern = /(^\s*\/\/.*\n)+(?=\s*(package|func|type|var|const)\b)/gm;
        let removed = 0;
        const result = content.replace(docPattern, (match) => {
            const lines = match.split("\n").filter((line) => line.trim().length > 0);
            removed += lines.length;
            return "";
        });
        if (removed > 0)
            onRemoved(removed);
        return result;
    }
    minifyWhitespace(content) {
        let result = content.replace(/[ \t]+$/gm, "");
        result = result.replace(/\n{4,}/g, "\n\n\n");
        result = result.replace(/^\n+/, "");
        result = result.replace(/\n+$/, "\n");
        return result;
    }
    getStats(originalTokens, optimizedTokens) {
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
    reset() {
        this.commentsRemoved = 0;
        this.docstringsRemoved = 0;
        this.truncatedFiles = [];
    }
}
exports.ContextOptimizer = ContextOptimizer;
//# sourceMappingURL=contextOptimizer.js.map