import test from "node:test";
import assert from "node:assert/strict";
import { FilterService } from "../filterService";
import { IFileSystemService } from "../types";

function createFileSystemMock(): IFileSystemService {
  return {
    getAllFiles: async () => [],
    readFile: async (filePath: string) => {
      if (filePath.endsWith(".gitignore")) return "notes.txt\n";
      if (filePath.endsWith(".codedumpignore")) return "ignored.md\n";
      return "";
    },
    fileExists: async (filePath: string) => filePath.endsWith(".gitignore") || filePath.endsWith(".codedumpignore"),
    getFileStats: async () => ({ size: 1, mtime: new Date() })
  };
}

test("FilterService returns exclusion reasons in the right order", async () => {
  const fileSystem = createFileSystemMock();
  const filter = new FilterService(fileSystem);
  const basePath = "/repo";

  filter.setSensitivePatterns(["*.env", "*.secret"], true);
  await filter.loadGitignore(basePath);
  await filter.loadCodedumpIgnore(basePath, true);

  const extensions = [".md", ".txt", ".env"];

  assert.equal(
    await filter.getExcludeReason("/repo/file.env", basePath, extensions, false),
    "sensitive"
  );
  assert.equal(
    await filter.getExcludeReason("/repo/notes.txt", basePath, extensions, false),
    "gitignore"
  );
  assert.equal(
    await filter.getExcludeReason("/repo/ignored.md", basePath, extensions, false),
    "codedumpignore"
  );
  assert.equal(
    await filter.getExcludeReason("/repo/README.js", basePath, extensions, false),
    "extension"
  );
  assert.equal(
    await filter.getExcludeReason("/repo/README.md", basePath, extensions, false),
    null
  );
});
