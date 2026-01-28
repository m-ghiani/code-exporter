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
exports.ConfigService = void 0;
const vscode = __importStar(require("vscode"));
const DEFAULT_SMART_FILTERS = {
    autoExclude: ["node_modules", "dist", "build", ".git", "coverage", ".vscode", ".idea"],
    maxFileSize: "1MB",
    skipBinaryFiles: true,
    includePatterns: [],
    excludePatterns: ["*.log", "*.tmp", "*.cache"]
};
const DEFAULT_SENSITIVE_PATTERNS = [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.crt",
    "*.cer",
    "credentials.*",
    "*secret*",
    "*.secrets",
    ".npmrc",
    ".pypirc",
    "*.keystore",
    "id_rsa*",
    "id_dsa*",
    "id_ecdsa*",
    "id_ed25519*",
    "*.gpg",
    "serviceAccountKey.json",
    "firebase-adminsdk*.json"
];
class ConfigService {
    config;
    constructor() {
        this.config = vscode.workspace.getConfiguration("codeDump");
    }
    load() {
        return {
            defaultExtensions: this.config.get("defaultExtensions", [".ts", ".js", ".py"]),
            outputFormat: this.config.get("outputFormat", ".md"),
            openAfterExport: this.config.get("openAfterExport", true),
            copyToClipboard: this.config.get("copyToClipboard", false),
            compactMode: this.config.get("compactMode", false),
            dryRun: this.config.get("dryRun", false),
            skipEmptyFiles: this.config.get("skipEmptyFiles", "ask"),
            useSmartFilters: this.config.get("useSmartFilters", true),
            useCodedumpIgnore: this.config.get("useCodedumpIgnore", true),
            enablePresets: this.config.get("enablePresets", true),
            includeMetadata: this.config.get("includeMetadata", false),
            showTokenEstimate: this.config.get("showTokenEstimate", true),
            smartFilters: this.getSmartFilters(),
            maxChunkSize: this.config.get("maxChunkSize", 500000),
            excludeSensitiveFiles: this.config.get("excludeSensitiveFiles", true),
            sensitivePatterns: this.config.get("sensitivePatterns", DEFAULT_SENSITIVE_PATTERNS),
            rememberLastChoice: this.config.get("rememberLastChoice", true),
            showPreview: this.config.get("showPreview", "ask")
        };
    }
    getSmartFilters() {
        return this.config.get("smartFilters", DEFAULT_SMART_FILTERS);
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=configService.js.map