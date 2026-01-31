"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const contextOptimizer_1 = require("../contextOptimizer");
const baseConfig = {
    enabled: true,
    maxTokenBudget: 100000,
    removeComments: true,
    removeDocstrings: true,
    minifyWhitespace: true,
    truncateLargeFiles: true,
    maxLinesPerFile: 2,
    prioritizeRecentFiles: true
};
(0, node_test_1.default)("ContextOptimizer removes comments, minifies whitespace, and truncates", () => {
    const optimizer = new contextOptimizer_1.ContextOptimizer(baseConfig);
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
    strict_1.default.ok(lines.length >= 4);
    strict_1.default.ok(nonEmpty.includes("const a = 1;"));
    strict_1.default.match(optimized, /truncated/);
    const stats = optimizer.getStats(100, 80);
    strict_1.default.equal(stats.truncatedFiles.length, 1);
    strict_1.default.ok(stats.commentsRemoved > 0);
});
(0, node_test_1.default)("ContextOptimizer returns original content when disabled", () => {
    const optimizer = new contextOptimizer_1.ContextOptimizer({ ...baseConfig, enabled: false });
    const content = "const x = 1;\n";
    const optimized = optimizer.optimizeContent(content, "src/index.ts", "ts");
    strict_1.default.equal(optimized, content);
});
(0, node_test_1.default)("ContextOptimizer preserves URLs inside strings", () => {
    const optimizer = new contextOptimizer_1.ContextOptimizer({
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
    strict_1.default.match(optimized, /https:\/\/example\.com\/path/);
    strict_1.default.match(optimized, /http:\/\/example\.org\/test/);
    strict_1.default.match(optimized, /`https:\/\/example\.com\//);
    strict_1.default.ok(!optimized.includes("// trailing"));
});
(0, node_test_1.default)("ContextOptimizer preserves JS doc comments when configured", () => {
    const optimizer = new contextOptimizer_1.ContextOptimizer({
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
    strict_1.default.ok(optimized.includes("/** docs */"));
    strict_1.default.ok(!optimized.includes("// inline"));
});
(0, node_test_1.default)("ContextOptimizer removes doc comments when enabled", () => {
    const optimizer = new contextOptimizer_1.ContextOptimizer({
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
    strict_1.default.ok(!optimized.includes("/** docs */"));
    strict_1.default.ok(optimized.includes("// regular"));
});
(0, node_test_1.default)("ContextOptimizer removes Python docstrings", () => {
    const optimizer = new contextOptimizer_1.ContextOptimizer({
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
    strict_1.default.ok(!optimized.includes("Module docs"));
    strict_1.default.ok(!optimized.includes("Func docs"));
});
//# sourceMappingURL=contextOptimizer.test.js.map