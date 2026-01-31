import test from "node:test";
import assert from "node:assert/strict";
import { ContextOptimizer } from "../contextOptimizer";
import { AiContextOptimizerConfig } from "../types";

const baseConfig: AiContextOptimizerConfig = {
  enabled: true,
  maxTokenBudget: 100000,
  removeComments: true,
  removeDocstrings: true,
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
  const nonEmpty = lines.filter((line) => line.trim().length > 0);

  assert.ok(lines.length >= 4);
  assert.ok(nonEmpty.includes("const a = 1;"));
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

test("ContextOptimizer preserves URLs inside strings", () => {
  const optimizer = new ContextOptimizer({
    ...baseConfig,
    removeDocstrings: false,
    minifyWhitespace: false,
    truncateLargeFiles: false
  });
  const content = [
    "const url = \"https://example.com/path\"; // trailing",
    "const other = 'http://example.org/test';",
    "const templ = `https://example.com/${id}`;"
  ].join("\n");

  const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
  assert.match(optimized, /https:\/\/example\.com\/path/);
  assert.match(optimized, /http:\/\/example\.org\/test/);
  assert.match(optimized, /`https:\/\/example\.com\//);
  assert.ok(!optimized.includes("// trailing"));
});

test("ContextOptimizer preserves JS doc comments when configured", () => {
  const optimizer = new ContextOptimizer({
    ...baseConfig,
    removeDocstrings: false,
    minifyWhitespace: false,
    truncateLargeFiles: false
  });
  const content = [
    "/** docs */",
    "const a = 1;",
    "// inline",
    "const b = 2;"
  ].join("\n");

  const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
  assert.ok(optimized.includes("/** docs */"));
  assert.ok(!optimized.includes("// inline"));
});

test("ContextOptimizer removes doc comments when enabled", () => {
  const optimizer = new ContextOptimizer({
    ...baseConfig,
    removeComments: false,
    removeDocstrings: true,
    minifyWhitespace: false,
    truncateLargeFiles: false
  });
  const content = [
    "/** docs */",
    "const a = 1;",
    "// regular",
    "const b = 2;"
  ].join("\n");

  const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
  assert.ok(!optimized.includes("/** docs */"));
  assert.ok(optimized.includes("// regular"));
});

test("ContextOptimizer removes Python docstrings", () => {
  const optimizer = new ContextOptimizer({
    ...baseConfig,
    removeComments: false,
    removeDocstrings: true,
    minifyWhitespace: false,
    truncateLargeFiles: false
  });
  const content = [
    "\"\"\"Module docs\"\"\"",
    "",
    "def foo():",
    "    \"\"\"Func docs\"\"\"",
    "    return 1"
  ].join("\n");

  const optimized = optimizer.optimizeContent(content, "src/module.py", "py");
  assert.ok(!optimized.includes("Module docs"));
  assert.ok(!optimized.includes("Func docs"));
});
