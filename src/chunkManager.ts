import * as fs from "fs/promises";

export class ChunkManager {
  private chunkIndex = 0;
  private buffer = "";
  private readonly maxChunkSize: number;
  private readonly outputPath: string;
  private readonly outputFormat: string;
  private writtenFiles: string[] = [];

  constructor(outputPath: string, outputFormat: string, maxChunkSize = 500000) {
    this.outputPath = outputPath;
    this.outputFormat = outputFormat;
    this.maxChunkSize = maxChunkSize;
  }

  async addContent(content: string): Promise<void> {
    if ((this.buffer.length + content.length) > this.maxChunkSize && this.buffer.length > 0) {
      await this.writeCurrentChunk();
    }
    this.buffer += content;
  }

  private async writeCurrentChunk(): Promise<void> {
    const chunkPath = this.getChunkPath();
    await fs.writeFile(chunkPath, this.buffer, "utf8");
    this.writtenFiles.push(chunkPath);
    this.buffer = "";
    this.chunkIndex++;
  }

  private getChunkPath(): string {
    if (this.chunkIndex === 0) return this.outputPath;
    const basePath = this.outputPath.replace(this.outputFormat, "");
    return `${basePath}-part${this.chunkIndex + 1}${this.outputFormat}`;
  }

  async finalize(): Promise<string[]> {
    if (this.buffer.length > 0) {
      const finalPath = this.getChunkPath();
      await fs.writeFile(finalPath, this.buffer, "utf8");
      this.writtenFiles.push(finalPath);
      this.buffer = "";
    }

    return [...this.writtenFiles];
  }

  getChunkCount(): number {
    return this.chunkIndex + (this.buffer.length > 0 ? 1 : 0);
  }
}
