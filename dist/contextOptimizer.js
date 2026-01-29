"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextOptimizer = void 0;
class ContextOptimizer {
    config;
    commentsRemoved = 0;
    truncatedFiles = [];
    constructor(config) {
        this.config = config;
    }
    optimizeContent(content, filePath, extension) {
        if (!this.config.enabled) {
            return content;
        }
        let optimized = content;
        // Remove comments based on file extension
        if (this.config.removeComments) {
            optimized = this.removeComments(optimized, extension);
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
    removeComments(content, extension) {
        const originalLength = content.length;
        let result = content;
        // Language-specific comment removal
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
                // Remove single-line comments (but preserve URLs)
                result = result.replace(/(?<!:)\/\/(?![\/\*]).*$/gm, "");
                // Remove multi-line comments
                result = result.replace(/\/\*[\s\S]*?\*\//g, "");
                break;
            case "py":
                // Remove Python comments
                result = result.replace(/#(?!!).*$/gm, "");
                // Remove docstrings (triple quotes)
                result = result.replace(/"""[\s\S]*?"""/g, '""');
                result = result.replace(/'''[\s\S]*?'''/g, "''");
                break;
            case "rb":
                // Remove Ruby comments
                result = result.replace(/#.*$/gm, "");
                break;
            case "html":
            case "xml":
            case "vue":
            case "svelte":
                // Remove HTML comments
                result = result.replace(/<!--[\s\S]*?-->/g, "");
                break;
            case "css":
            case "scss":
            case "less":
                // Remove CSS comments
                result = result.replace(/\/\*[\s\S]*?\*\//g, "");
                break;
            case "sql":
                // Remove SQL comments
                result = result.replace(/--.*$/gm, "");
                result = result.replace(/\/\*[\s\S]*?\*\//g, "");
                break;
            case "sh":
            case "bash":
            case "zsh":
                // Remove shell comments
                result = result.replace(/#(?!!).*$/gm, "");
                break;
        }
        // Count removed comments (approximate by character difference)
        const charsRemoved = originalLength - result.length;
        if (charsRemoved > 0) {
            this.commentsRemoved += Math.ceil(charsRemoved / 50); // Rough estimate of comments
        }
        return result;
    }
    minifyWhitespace(content) {
        // Remove trailing whitespace from each line
        let result = content.replace(/[ \t]+$/gm, "");
        // Reduce multiple blank lines to maximum 2
        result = result.replace(/\n{4,}/g, "\n\n\n");
        // Remove leading blank lines
        result = result.replace(/^\n+/, "");
        // Remove trailing blank lines
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
            commentsRemoved: this.commentsRemoved
        };
    }
    reset() {
        this.commentsRemoved = 0;
        this.truncatedFiles = [];
    }
}
exports.ContextOptimizer = ContextOptimizer;
//# sourceMappingURL=contextOptimizer.js.map