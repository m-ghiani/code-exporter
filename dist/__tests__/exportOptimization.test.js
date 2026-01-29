"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const exportOptimization_1 = require("../exportOptimization");
const contextOptimizer_1 = require("../contextOptimizer");
(0, node_test_1.default)("prioritizeFiles favors entry points over recency", () => {
    const files = [
        "/repo/src/feature.ts",
        "/repo/src/index.ts",
        "/repo/README.md"
    ];
    const stats = new Map([
        ["/repo/src/feature.ts", new Date("2025-01-01T00:00:00Z")],
        ["/repo/src/index.ts", new Date("2024-01-01T00:00:00Z")],
        ["/repo/README.md", new Date("2026-01-01T00:00:00Z")]
    ]);
    const ordered = (0, exportOptimization_1.prioritizeFiles)(files, "/repo", (filePath) => ({ mtime: stats.get(filePath) ?? new Date(0) }), true);
    strict_1.default.equal(ordered[0], "/repo/src/index.ts");
});
(0, node_test_1.default)("prioritizeFiles uses recency when scores match", () => {
    const files = ["/repo/src/a.ts", "/repo/src/b.ts"];
    const stats = new Map([
        ["/repo/src/a.ts", new Date("2024-01-01T00:00:00Z")],
        ["/repo/src/b.ts", new Date("2025-01-01T00:00:00Z")]
    ]);
    const ordered = (0, exportOptimization_1.prioritizeFiles)(files, "/repo", (filePath) => ({ mtime: stats.get(filePath) ?? new Date(0) }), true);
    strict_1.default.deepEqual(ordered, ["/repo/src/b.ts", "/repo/src/a.ts"]);
});
(0, node_test_1.default)("optimizeContent uses optimizer when provided", () => {
    const config = {
        enabled: true,
        maxTokenBudget: 100000,
        removeComments: true,
        minifyWhitespace: true,
        truncateLargeFiles: false,
        maxLinesPerFile: 500,
        prioritizeRecentFiles: true
    };
    const optimizer = new contextOptimizer_1.ContextOptimizer(config);
    const result = (0, exportOptimization_1.optimizeContent)("const a = 1; // comment\n", "src/index.ts", "ts", optimizer);
    strict_1.default.equal(result.optimizedContent.trim(), "const a = 1;");
    strict_1.default.ok(result.optimizedTokens <= result.originalTokens);
});
(0, node_test_1.default)("wouldExceedBudget reports budget overflow", () => {
    strict_1.default.equal((0, exportOptimization_1.wouldExceedBudget)(90, 15, 100), true);
    strict_1.default.equal((0, exportOptimization_1.wouldExceedBudget)(90, 10, 100), false);
});
//# sourceMappingURL=exportOptimization.test.js.map