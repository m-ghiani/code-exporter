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
exports.ChunkManager = void 0;
const fs = __importStar(require("fs/promises"));
class ChunkManager {
    chunkIndex = 0;
    buffer = "";
    maxChunkSize;
    outputPath;
    outputFormat;
    writtenFiles = [];
    constructor(outputPath, outputFormat, maxChunkSize = 500000) {
        this.outputPath = outputPath;
        this.outputFormat = outputFormat;
        this.maxChunkSize = maxChunkSize;
    }
    async addContent(content) {
        if ((this.buffer.length + content.length) > this.maxChunkSize && this.buffer.length > 0) {
            await this.writeCurrentChunk();
        }
        this.buffer += content;
    }
    async writeCurrentChunk() {
        const chunkPath = this.getChunkPath();
        await fs.writeFile(chunkPath, this.buffer, "utf8");
        this.writtenFiles.push(chunkPath);
        this.buffer = "";
        this.chunkIndex++;
    }
    getChunkPath() {
        if (this.chunkIndex === 0)
            return this.outputPath;
        const basePath = this.outputPath.replace(this.outputFormat, "");
        return `${basePath}-part${this.chunkIndex + 1}${this.outputFormat}`;
    }
    async finalize() {
        if (this.buffer.length > 0) {
            const finalPath = this.getChunkPath();
            await fs.writeFile(finalPath, this.buffer, "utf8");
            this.writtenFiles.push(finalPath);
            this.buffer = "";
        }
        return [...this.writtenFiles];
    }
    getChunkCount() {
        return this.chunkIndex + (this.buffer.length > 0 ? 1 : 0);
    }
}
exports.ChunkManager = ChunkManager;
//# sourceMappingURL=chunkManager.js.map