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
exports.TemplateManager = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class TemplateManager {
    templates = new Map();
    constructor() {
        this.initDefaultTemplates();
    }
    initDefaultTemplates() {
        this.templates.set("default-md", {
            name: "Default Markdown",
            pattern: "\n\n## {relativePath}\n\n```{extension}\n{content}\n```",
            withMetadata: false
        });
        this.templates.set("default-txt", {
            name: "Default Text",
            pattern: "\n\n================ {relativePath} ================\n\n{content}",
            withMetadata: false
        });
        this.templates.set("with-metadata", {
            name: "With Metadata",
            pattern: "\n\n## {relativePath}\n**Lines:** {lines} | **Size:** {size} bytes | **Modified:** {modified}\n\n```{extension}\n{content}\n```",
            withMetadata: true
        });
        this.templates.set("compact", {
            name: "Compact",
            pattern: "\n\n### {relativePath} ({lines}L)\n```{extension}\n{content}\n```",
            withMetadata: true
        });
        this.templates.set("ai-ready", {
            name: "AI Ready",
            pattern: "\n\n<!-- FILE: {relativePath} -->\n<!-- TOKENS: ~{tokens} -->\n```{extension}\n{content}\n```",
            withMetadata: true
        });
    }
    formatContent(templateKey, relativePath, content, filePath, outputFormat) {
        const template = this.templates.get(templateKey) || this.getDefaultTemplate(outputFormat);
        const stats = fs.statSync(filePath);
        const lines = content.split('\n').length;
        const tokens = this.estimateTokens(content);
        const extension = path.extname(filePath).replace(".", "");
        return template.pattern
            .replace(/{relativePath}/g, relativePath)
            .replace(/{content}/g, content)
            .replace(/{extension}/g, extension)
            .replace(/{lines}/g, lines.toString())
            .replace(/{size}/g, stats.size.toString())
            .replace(/{tokens}/g, tokens.toString())
            .replace(/{modified}/g, stats.mtime.toISOString().split('T')[0]);
    }
    getDefaultTemplate(outputFormat) {
        return outputFormat === ".md" ?
            this.templates.get("default-md") :
            this.templates.get("default-txt");
    }
    estimateTokens(content) {
        // Rough estimate: ~4 characters per token
        return Math.ceil(content.length / 4);
    }
    getTemplateNames() {
        return Array.from(this.templates.keys());
    }
    getTemplateOptions() {
        return Array.from(this.templates.entries()).map(([key, template]) => ({
            key,
            name: template.name,
            withMetadata: template.withMetadata
        }));
    }
    addCustomTemplate(key, template) {
        this.templates.set(key, template);
    }
}
exports.TemplateManager = TemplateManager;
//# sourceMappingURL=templateManager.js.map