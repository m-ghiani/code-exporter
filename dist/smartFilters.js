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
exports.SmartFilterManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SmartFilterManager {
    filters;
    constructor(filters) {
        this.filters = filters;
    }
    shouldExcludeFile(filePath, basePath) {
        const relativePath = path.relative(basePath, filePath);
        const stats = fs.statSync(filePath);
        // Check auto-exclude patterns
        for (const pattern of this.filters.autoExclude) {
            if (relativePath.includes(pattern))
                return true;
        }
        // Check custom exclude patterns
        for (const pattern of this.filters.excludePatterns) {
            if (this.matchesPattern(relativePath, pattern))
                return true;
        }
        // Check include patterns (if specified, file must match at least one)
        if (this.filters.includePatterns.length > 0) {
            const matches = this.filters.includePatterns.some(pattern => this.matchesPattern(relativePath, pattern));
            if (!matches)
                return true;
        }
        // Check file size
        if (this.filters.maxFileSize) {
            const maxBytes = this.parseFileSize(this.filters.maxFileSize);
            if (stats.size > maxBytes)
                return true;
        }
        // Check if binary (basic check)
        if (this.filters.skipBinaryFiles && this.isBinaryFile(filePath)) {
            return true;
        }
        return false;
    }
    matchesPattern(filePath, pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        return regex.test(filePath);
    }
    parseFileSize(sizeStr) {
        const match = sizeStr.match(/^(\d+)(KB|MB|GB)?$/i);
        if (!match)
            return Infinity;
        const size = parseInt(match[1]);
        const unit = (match[2] || '').toUpperCase();
        switch (unit) {
            case 'KB': return size * 1024;
            case 'MB': return size * 1024 * 1024;
            case 'GB': return size * 1024 * 1024 * 1024;
            default: return size;
        }
    }
    isBinaryFile(filePath) {
        try {
            const buffer = fs.readFileSync(filePath, { encoding: null });
            const sample = buffer.slice(0, Math.min(512, buffer.length));
            return sample.some(byte => byte === 0);
        }
        catch {
            return false;
        }
    }
}
exports.SmartFilterManager = SmartFilterManager;
//# sourceMappingURL=smartFilters.js.map