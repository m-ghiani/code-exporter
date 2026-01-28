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
exports.FilterService = void 0;
const path = __importStar(require("path"));
const ignore_1 = __importDefault(require("ignore"));
class FilterService {
    fileSystem;
    gitignore;
    codedumpIgnore;
    smartFilterManager = null;
    sensitivePatterns = [];
    excludeSensitive = true;
    constructor(fileSystem) {
        this.fileSystem = fileSystem;
        this.gitignore = (0, ignore_1.default)();
        this.codedumpIgnore = (0, ignore_1.default)();
    }
    setSmartFilterManager(manager) {
        this.smartFilterManager = manager;
    }
    setSensitivePatterns(patterns, enabled) {
        this.sensitivePatterns = patterns;
        this.excludeSensitive = enabled;
    }
    loadGitignore(folderUri) {
        const gitignorePath = path.join(folderUri, ".gitignore");
        this.gitignore = (0, ignore_1.default)();
        if (this.fileSystem.fileExists(gitignorePath)) {
            const content = this.fileSystem.readFile(gitignorePath);
            this.gitignore.add(content);
        }
    }
    loadCodedumpIgnore(folderUri, enabled) {
        const codedumpIgnorePath = path.join(folderUri, ".codedumpignore");
        this.codedumpIgnore = (0, ignore_1.default)();
        if (enabled && this.fileSystem.fileExists(codedumpIgnorePath)) {
            const content = this.fileSystem.readFile(codedumpIgnorePath);
            this.codedumpIgnore.add(content);
        }
    }
    shouldIncludeFile(filePath, basePath, extensions, useSmartFilters) {
        const relative = path.relative(basePath, filePath);
        const fileName = path.basename(filePath);
        // Extension filter
        if (!extensions.includes(path.extname(filePath))) {
            return false;
        }
        // Sensitive files filter
        if (this.excludeSensitive && this.isSensitiveFile(fileName, relative)) {
            return false;
        }
        // Gitignore filter
        if (this.gitignore.ignores(relative)) {
            return false;
        }
        // Codedumpignore filter
        if (this.codedumpIgnore.ignores(relative)) {
            return false;
        }
        // Smart filters
        if (useSmartFilters && this.smartFilterManager?.shouldExcludeFile(filePath, basePath)) {
            return false;
        }
        return true;
    }
    isSensitiveFile(fileName, relativePath) {
        for (const pattern of this.sensitivePatterns) {
            if (this.matchesPattern(fileName, pattern) || this.matchesPattern(relativePath, pattern)) {
                return true;
            }
        }
        return false;
    }
    matchesPattern(text, pattern) {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars except * and ?
            .replace(/\*/g, ".*") // * matches anything
            .replace(/\?/g, "."); // ? matches single char
        const regex = new RegExp(`^${regexPattern}$`, "i");
        return regex.test(text);
    }
}
exports.FilterService = FilterService;
//# sourceMappingURL=filterService.js.map