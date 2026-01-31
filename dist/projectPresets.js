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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectPresetManager = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
class ProjectPresetManager {
    presets = new Map();
    constructor() {
        this.initDefaultPresets();
    }
    initDefaultPresets() {
        this.presets.set("react", {
            name: "React Project",
            extensions: [".tsx", ".ts", ".jsx", ".js", ".css", ".scss", ".json"],
            excludePaths: ["node_modules", "build", "dist", ".next", "coverage"],
            template: "with-metadata"
        });
        this.presets.set("node", {
            name: "Node.js Project",
            extensions: [".js", ".ts", ".json", ".md"],
            excludePaths: ["node_modules", "dist", "coverage", ".nyc_output"],
            template: "default-md"
        });
        this.presets.set("python", {
            name: "Python Project",
            extensions: [".py", ".pyx", ".pyi", ".txt", ".md", ".yml", ".yaml"],
            excludePaths: ["__pycache__", "venv", ".venv", "dist", "build", ".pytest_cache"],
            template: "with-metadata"
        });
        this.presets.set("vue", {
            name: "Vue Project",
            extensions: [".vue", ".js", ".ts", ".css", ".scss", ".json"],
            excludePaths: ["node_modules", "dist", ".nuxt", "coverage"],
            template: "compact"
        });
        this.presets.set("angular", {
            name: "Angular Project",
            extensions: [".ts", ".html", ".css", ".scss", ".json"],
            excludePaths: ["node_modules", "dist", ".angular", "coverage"],
            template: "with-metadata"
        });
        this.presets.set("flutter", {
            name: "Flutter Project",
            extensions: [".dart", ".yaml", ".yml"],
            excludePaths: ["build", ".dart_tool", ".packages"],
            template: "default-md"
        });
        this.presets.set("rust", {
            name: "Rust Project",
            extensions: [".rs", ".toml", ".md"],
            excludePaths: ["target", "Cargo.lock"],
            template: "with-metadata"
        });
        this.presets.set("go", {
            name: "Go Project",
            extensions: [".go", ".mod", ".sum", ".md"],
            excludePaths: ["vendor", "bin"],
            template: "default-md"
        });
    }
    async detectProjectType(folderPath) {
        try {
            const files = await fs.readdir(folderPath);
            // React/Next.js detection
            if (files.includes("package.json")) {
                const packagePath = path.join(folderPath, "package.json");
                const packageContent = JSON.parse(await fs.readFile(packagePath, "utf8"));
                const deps = { ...packageContent.dependencies, ...packageContent.devDependencies };
                if (deps.react)
                    return "react";
                if (deps.vue)
                    return "vue";
                if (deps["@angular/core"])
                    return "angular";
                return "node";
            }
            // Python detection
            if (files.some(f => ["requirements.txt", "setup.py", "pyproject.toml", "Pipfile"].includes(f))) {
                return "python";
            }
            // Flutter detection
            if (files.includes("pubspec.yaml")) {
                return "flutter";
            }
            // Rust detection
            if (files.includes("Cargo.toml")) {
                return "rust";
            }
            // Go detection
            if (files.includes("go.mod")) {
                return "go";
            }
            return null;
        }
        catch {
            return null;
        }
    }
    getPreset(key) {
        return this.presets.get(key);
    }
    getAllPresets() {
        return Array.from(this.presets.entries()).map(([key, preset]) => ({ key, preset }));
    }
    addCustomPreset(key, preset) {
        this.presets.set(key, preset);
    }
}
exports.ProjectPresetManager = ProjectPresetManager;
//# sourceMappingURL=projectPresets.js.map