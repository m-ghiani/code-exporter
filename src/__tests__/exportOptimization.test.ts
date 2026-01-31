import test from "node:test";
import assert from "node:assert/strict";
import {
  prioritizeFiles,
  optimizeContent,
  wouldExceedBudget
} from "../exportOptimization";
import { ContextOptimizer } from "../contextOptimizer";
import { AiContextOptimizerConfig } from "../types";

test("prioritizeFiles favors entry points over recency", async () => {
  const files = [
    "/repo/src/feature.ts",
    "/repo/src/index.ts",
    "/repo/README.md"
  ];
  const stats = new Map<string, Date>([
    ["/repo/src/feature.ts", new Date("2025-01-01T00:00:00Z")],
    ["/repo/src/index.ts", new Date("2024-01-01T00:00:00Z")],
    ["/repo/README.md", new Date("2026-01-01T00:00:00Z")]
  ]);

  const ordered = await prioritizeFiles(
    files,
    "/repo",
    async (filePath) => ({ mtime: stats.get(filePath) ?? new Date(0) }),
    true
  );

  assert.equal(ordered[0], "/repo/src/index.ts");
});

test("prioritizeFiles uses recency when scores match", async () => {
  const files = ["/repo/src/a.ts", "/repo/src/b.ts"];
  const stats = new Map<string, Date>([
    ["/repo/src/a.ts", new Date("2024-01-01T00:00:00Z")],
    ["/repo/src/b.ts", new Date("2025-01-01T00:00:00Z")]
  ]);

  const ordered = await prioritizeFiles(
    files,
    "/repo",
    async (filePath) => ({ mtime: stats.get(filePath) ?? new Date(0) }),
    true
  );

  assert.deepEqual(ordered, ["/repo/src/b.ts", "/repo/src/a.ts"]);
});

test("optimizeContent uses optimizer when provided", () => {
  const config: AiContextOptimizerConfig = {
    enabled: true,
    maxTokenBudget: 100000,
    removeComments: true,
    removeDocstrings: true,
    minifyWhitespace: true,
    truncateLargeFiles: false,
    maxLinesPerFile: 500,
    prioritizeRecentFiles: true
  };
  const optimizer = new ContextOptimizer(config);
  const result = optimizeContent(
    "const a = 1; // comment\n",
    "src/index.ts",
    "ts",
    optimizer
  );

  assert.equal(result.optimizedContent.trim(), "const a = 1;");
  assert.ok(result.optimizedTokens <= result.originalTokens);
});

test("wouldExceedBudget reports budget overflow", () => {
  assert.equal(wouldExceedBudget(90, 15, 100), true);
  assert.equal(wouldExceedBudget(90, 10, 100), false);
});
