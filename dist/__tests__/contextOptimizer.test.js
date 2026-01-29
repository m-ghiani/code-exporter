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
    strict_1.default.equal(lines.length, 4);
    strict_1.default.equal(lines[0], "const a = 1;");
    strict_1.default.equal(lines[1], "const b = 2;");
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
//# sourceMappingURL=contextOptimizer.test.js.map