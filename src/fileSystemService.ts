import * as fs from "fs";
import * as path from "path";
import { IFileSystemService } from "./types";

export class FileSystemService implements IFileSystemService {
  getAllFiles(dir: string): string[] {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      const files = entries
        .filter((file) => !file.isDirectory())
        .map((file) => path.join(dir, file.name));

      const folders = entries.filter((folder) => folder.isDirectory());

      for (const folder of folders) {
        try {
          files.push(...this.getAllFiles(path.join(dir, folder.name)));
        } catch (error) {
          console.warn(`Failed to read directory ${folder.name}:`, error);
        }
      }

      return files;
    } catch (error) {
      console.warn(`Failed to read directory ${dir}:`, error);
      return [];
    }
  }

  readFile(filePath: string): string {
    return fs.readFileSync(filePath, "utf8");
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  getFileStats(filePath: string): { size: number; mtime: Date } {
    const stats = fs.statSync(filePath);
    return { size: stats.size, mtime: stats.mtime };
  }
}
