import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DependencyAnalyzer } from "../dependencyAnalyzer";
import { AliasResolver } from "../aliasResolver";

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

test("DependencyAnalyzer resolves alias imports from tsconfig paths", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-exporter-alias-"));
  const tsconfigPath = path.join(tempDir, "tsconfig.json");
  fs.writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@utils/*": ["src/utils/*"]
        }
      }
    }),
    "utf8"
  );

  const aliasResolver = new AliasResolver({ basePath: tempDir, configPath: tsconfigPath });
  const analyzer = new DependencyAnalyzer(tempDir, aliasResolver);

  analyzer.addFile("src/index.ts", "import logger from '@utils/logger';\n");
  analyzer.addFile("src/utils/logger.ts", "export const logger = () => null;\n");

  const graph = analyzer.analyze();
  const edges = graph.edges.map((edge) => `${edge.from}->${edge.to}`);

  assert.deepEqual(edges, ["src/index.ts->src/utils/logger.ts"]);
});
