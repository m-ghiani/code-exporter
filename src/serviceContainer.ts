import { ConfigService } from "./configService";
import { FileSystemService } from "./fileSystemService";
import { FilterService } from "./filterService";
import { SmartFilterManager } from "./smartFilters";
import { TemplateManager } from "./templateManager";
import { ProjectPresetManager } from "./projectPresets";
import { StatusBarManager } from "./statusBarManager";
import { StateService } from "./stateService";
import { ExportLogger } from "./exportLogger";
import { ChunkManager } from "./chunkManager";
import { IConfigService, IFileSystemService, IFilterService } from "./types";

export interface ServiceContainer {
  config: IConfigService;
  fileSystem: IFileSystemService;
  filter: IFilterService;
  template: TemplateManager;
  preset: ProjectPresetManager;
  statusBar: StatusBarManager;
  state: StateService;
}

export interface ExportManagers {
  logger: ExportLogger;
  chunk: ChunkManager;
}

export class ServiceContainerFactory {
  private static instance: ServiceContainer | null = null;

  static create(): ServiceContainer {
    if (this.instance) {
      return this.instance;
    }

    const fileSystem = new FileSystemService();
    const config = new ConfigService();
    const filter = new FilterService(fileSystem);

    // Configure filter managers
    const exportConfig = config.load();
    const smartFilterManager = new SmartFilterManager(exportConfig.smartFilters);
    filter.setSmartFilterManager(smartFilterManager);
    filter.setSensitivePatterns(exportConfig.sensitivePatterns, exportConfig.excludeSensitiveFiles);

    this.instance = {
      config,
      fileSystem,
      filter,
      template: new TemplateManager(),
      preset: new ProjectPresetManager(),
      statusBar: new StatusBarManager(),
      state: new StateService()
    };

    return this.instance;
  }

  static createExportManagers(
    outputPath: string,
    outputFormat: string,
    maxChunkSize: number
  ): ExportManagers {
    return {
      logger: new ExportLogger(),
      chunk: new ChunkManager(outputPath, outputFormat, maxChunkSize)
    };
  }

  static dispose(): void {
    if (this.instance) {
      this.instance.statusBar.dispose();
      this.instance = null;
    }
  }

  static refreshConfig(): void {
    if (this.instance) {
      // Re-create config service to pick up new settings
      this.instance.config = new ConfigService();

      // Update filter managers with new config
      const exportConfig = this.instance.config.load();
      const smartFilterManager = new SmartFilterManager(exportConfig.smartFilters);
      const filterService = this.instance.filter as FilterService;
      filterService.setSmartFilterManager(smartFilterManager);
      filterService.setSensitivePatterns(exportConfig.sensitivePatterns, exportConfig.excludeSensitiveFiles);
    }
  }
}
