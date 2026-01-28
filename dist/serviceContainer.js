"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceContainerFactory = void 0;
const configService_1 = require("./configService");
const fileSystemService_1 = require("./fileSystemService");
const filterService_1 = require("./filterService");
const smartFilters_1 = require("./smartFilters");
const templateManager_1 = require("./templateManager");
const projectPresets_1 = require("./projectPresets");
const statusBarManager_1 = require("./statusBarManager");
const stateService_1 = require("./stateService");
const exportLogger_1 = require("./exportLogger");
const chunkManager_1 = require("./chunkManager");
class ServiceContainerFactory {
    static instance = null;
    static create() {
        if (this.instance) {
            return this.instance;
        }
        const fileSystem = new fileSystemService_1.FileSystemService();
        const config = new configService_1.ConfigService();
        const filter = new filterService_1.FilterService(fileSystem);
        // Configure filter managers
        const exportConfig = config.load();
        const smartFilterManager = new smartFilters_1.SmartFilterManager(exportConfig.smartFilters);
        filter.setSmartFilterManager(smartFilterManager);
        filter.setSensitivePatterns(exportConfig.sensitivePatterns, exportConfig.excludeSensitiveFiles);
        this.instance = {
            config,
            fileSystem,
            filter,
            template: new templateManager_1.TemplateManager(),
            preset: new projectPresets_1.ProjectPresetManager(),
            statusBar: new statusBarManager_1.StatusBarManager(),
            state: new stateService_1.StateService()
        };
        return this.instance;
    }
    static createExportManagers(outputPath, outputFormat, maxChunkSize) {
        return {
            logger: new exportLogger_1.ExportLogger(),
            chunk: new chunkManager_1.ChunkManager(outputPath, outputFormat, maxChunkSize)
        };
    }
    static dispose() {
        if (this.instance) {
            this.instance.statusBar.dispose();
            this.instance = null;
        }
    }
    static refreshConfig() {
        if (this.instance) {
            // Re-create config service to pick up new settings
            this.instance.config = new configService_1.ConfigService();
            // Update filter managers with new config
            const exportConfig = this.instance.config.load();
            const smartFilterManager = new smartFilters_1.SmartFilterManager(exportConfig.smartFilters);
            const filterService = this.instance.filter;
            filterService.setSmartFilterManager(smartFilterManager);
            filterService.setSensitivePatterns(exportConfig.sensitivePatterns, exportConfig.excludeSensitiveFiles);
        }
    }
}
exports.ServiceContainerFactory = ServiceContainerFactory;
//# sourceMappingURL=serviceContainer.js.map