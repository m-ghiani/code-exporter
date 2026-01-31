"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const dependencyAnalyzer_1 = require("../dependencyAnalyzer");
const aliasResolver_1 = require("../aliasResolver");
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
(0, node_test_1.default)("DependencyAnalyzer resolves alias imports from tsconfig paths", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-exporter-alias-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: {
            baseUrl: ".",
            paths: {
                "@utils/*": ["src/utils/*"]
            }
        }
    }), "utf8");
    const aliasResolver = new aliasResolver_1.AliasResolver({ basePath: tempDir, configPath: tsconfigPath });
    const analyzer = new dependencyAnalyzer_1.DependencyAnalyzer(tempDir, aliasResolver);
    analyzer.addFile("src/index.ts", "import logger from '@utils/logger';\n");
    analyzer.addFile("src/utils/logger.ts", "export const logger = () => null;\n");
    const graph = analyzer.analyze();
    const edges = graph.edges.map((edge) => `${edge.from}->${edge.to}`);
    strict_1.default.deepEqual(edges, ["src/index.ts->src/utils/logger.ts"]);
});
//# sourceMappingURL=dependencyAnalyzer.test.js.map