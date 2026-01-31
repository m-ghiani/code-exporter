import * as fs from "fs/promises";
import * as path from "path";
import { ProjectPreset } from "./types";

export class ProjectPresetManager {
  private presets: Map<string, ProjectPreset> = new Map();

  constructor() {
    this.initDefaultPresets();
  }

  private initDefaultPresets(): void {
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

  async detectProjectType(folderPath: string): Promise<string | null> {
    try {
      const files = await fs.readdir(folderPath);
      
      // React/Next.js detection
      if (files.includes("package.json")) {
        const packagePath = path.join(folderPath, "package.json");
        const packageContent = JSON.parse(await fs.readFile(packagePath, "utf8"));
        const deps = { ...packageContent.dependencies, ...packageContent.devDependencies };
        
        if (deps.react) return "react";
        if (deps.vue) return "vue";
        if (deps["@angular/core"]) return "angular";
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
    } catch {
      return null;
    }
  }

  getPreset(key: string): ProjectPreset | undefined {
    return this.presets.get(key);
  }

  getAllPresets(): Array<{ key: string; preset: ProjectPreset }> {
    return Array.from(this.presets.entries()).map(([key, preset]) => ({ key, preset }));
  }

  addCustomPreset(key: string, preset: ProjectPreset): void {
    this.presets.set(key, preset);
  }
}
