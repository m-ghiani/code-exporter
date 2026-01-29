import test from "node:test";
import assert from "node:assert/strict";
import { DependencyAnalyzer } from "../dependencyAnalyzer";

test("DependencyAnalyzer builds edges for local imports", () => {
  const analyzer = new DependencyAnalyzer("/repo");

  analyzer.addFile("src/index.ts", "import './utils';\nimport './types';\n");
  analyzer.addFile("src/utils.ts", "import './types';\n");
  analyzer.addFile("src/types.ts", "export type X = string;\n");

  const graph = analyzer.analyze();

  assert.deepEqual(graph.nodes.sort(), [
    "src/index.ts",
    "src/types.ts",
    "src/utils.ts"
  ]);

  const edges = graph.edges.map((edge) => `${edge.from}->${edge.to}`).sort();
  assert.deepEqual(edges, [
    "src/index.ts->src/types.ts",
    "src/index.ts->src/utils.ts",
    "src/utils.ts->src/types.ts"
  ]);
});
