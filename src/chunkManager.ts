import * as fs from "fs";

export class ChunkManager {
  private chunkIndex = 0;
  private buffer = "";
  private readonly maxChunkSize: number;
  private readonly outputPath: string;
  private readonly outputFormat: string;

  constructor(outputPath: string, outputFormat: string, maxChunkSize = 500000) {
    this.outputPath = outputPath;
    this.outputFormat = outputFormat;
    this.maxChunkSize = maxChunkSize;
  }

  addContent(content: string): void {
    if ((this.buffer.length + content.length) > this.maxChunkSize && this.buffer.length > 0) {
      this.writeCurrentChunk();
    }
    this.buffer += content;
  }

  private writeCurrentChunk(): void {
    const chunkPath = this.getChunkPath();
    fs.writeFileSync(chunkPath, this.buffer, "utf8");
    this.buffer = "";
    this.chunkIndex++;
  }

  private getChunkPath(): string {
    if (this.chunkIndex === 0) return this.outputPath;
    const basePath = this.outputPath.replace(this.outputFormat, "");
    return `${basePath}-part${this.chunkIndex + 1}${this.outputFormat}`;
  }

  finalize(): string[] {
    const writtenFiles: string[] = [];
    
    if (this.buffer.length > 0) {
      const finalPath = this.getChunkPath();
      fs.writeFileSync(finalPath, this.buffer, "utf8");
      writtenFiles.push(finalPath);
    }

    return writtenFiles;
  }

  getChunkCount(): number {
    return this.chunkIndex + (this.buffer.length > 0 ? 1 : 0);
  }
}