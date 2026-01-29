import test from "node:test";
import assert from "node:assert/strict";
import { ContextOptimizer } from "../contextOptimizer";
import { AiContextOptimizerConfig } from "../types";

const baseConfig: AiContextOptimizerConfig = {
  enabled: true,
  maxTokenBudget: 100000,
  removeComments: true,
  minifyWhitespace: true,
  truncateLargeFiles: true,
  maxLinesPerFile: 2,
  prioritizeRecentFiles: true
};

test("ContextOptimizer removes comments, minifies whitespace, and truncates", () => {
  const optimizer = new ContextOptimizer(baseConfig);
  const content = [
    "const a = 1; // comment",
    "",
    "/* block */",
    "const b = 2;",
    "",
    "",
    "const c = 3;"
  ].join("\n");

  const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
  const lines = optimized.split("\n");

  assert.equal(lines.length, 4);
  assert.equal(lines[0], "const a = 1;");
  assert.equal(lines[1], "const b = 2;");
  assert.match(optimized, /truncated/);

  const stats = optimizer.getStats(100, 80);
  assert.equal(stats.truncatedFiles.length, 1);
  assert.ok(stats.commentsRemoved > 0);
});

test("ContextOptimizer returns original content when disabled", () => {
  const optimizer = new ContextOptimizer({ ...baseConfig, enabled: false });
  const content = "const x = 1;\n";
  const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
  assert.equal(optimized, content);
});
