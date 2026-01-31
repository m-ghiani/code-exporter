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
      .replace(/{extension}/g, extension)
      .replace(/{lines}/g, lines.toString())
      .replace(/{size}/g, stats.size.toString())
      .replace(/{tokens}/g, tokens.toString())
      .replace(/{modified}/g, stats.mtime.toISOString().split('T')[0]);
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
