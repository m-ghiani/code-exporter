import * as fs from "fs/promises";
import * as path from "path";
import { IFileSystemService } from "./types";

export class FileSystemService implements IFileSystemService {
  async getAllFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      const files = entries
        .filter((file) => !file.isDirectory())
        .map((file) => path.join(dir, file.name));

      const folders = entries.filter((folder) => folder.isDirectory());
      const nested = await Promise.all(
        folders.map(async (folder) => {
          try {
            return await this.getAllFiles(path.join(dir, folder.name));
          } catch (error) {
            console.warn(`Failed to read directory ${folder.name}:`, error);
            return [];
          }
        })
      );

      return files.concat(...nested);
    } catch (error) {
      console.warn(`Failed to read directory ${dir}:`, error);
      return [];
    }
  }

  async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, "utf8");
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getFileStats(filePath: string): Promise<{ size: number; mtime: Date }> {
    const stats = await fs.stat(filePath);
    return { size: stats.size, mtime: stats.mtime };
  }
}
