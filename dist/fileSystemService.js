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
exports.FileSystemService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class FileSystemService {
    getAllFiles(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            const files = entries
                .filter((file) => !file.isDirectory())
                .map((file) => path.join(dir, file.name));
            const folders = entries.filter((folder) => folder.isDirectory());
            for (const folder of folders) {
                try {
                    files.push(...this.getAllFiles(path.join(dir, folder.name)));
                }
                catch (error) {
                    console.warn(`Failed to read directory ${folder.name}:`, error);
                }
            }
            return files;
        }
        catch (error) {
            console.warn(`Failed to read directory ${dir}:`, error);
            return [];
        }
    }
    readFile(filePath) {
        return fs.readFileSync(filePath, "utf8");
    }
    fileExists(filePath) {
        return fs.existsSync(filePath);
    }
    getFileStats(filePath) {
        const stats = fs.statSync(filePath);
        return { size: stats.size, mtime: stats.mtime };
    }
}
exports.FileSystemService = FileSystemService;
//# sourceMappingURL=fileSystemService.js.map