"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const dependencyAnalyzer_1 = require("../dependencyAnalyzer");
(0, node_test_1.default)("DependencyAnalyzer builds edges for local imports", () => {
    const analyzer = new dependencyAnalyzer_1.DependencyAnalyzer("/repo");
    analyzer.addFile("src/index.ts", "import './utils';\nimport './types';\n");
    analyzer.addFile("src/utils.ts", "import './types';\n");
    analyzer.addFile("src/types.ts", "export type X = string;\n");
    const graph = analyzer.analyze();
    strict_1.default.deepEqual(graph.nodes.sort(), [
        "src/index.ts",
        "src/types.ts",
        "src/utils.ts"
    ]);
    const edges = graph.edges.map((edge) => `${edge.from}->${edge.to}`).sort();
    strict_1.default.deepEqual(edges, [
        "src/index.ts->src/types.ts",
        "src/index.ts->src/utils.ts",
        "src/utils.ts->src/types.ts"
    ]);
});
//# sourceMappingURL=dependencyAnalyzer.test.js.map