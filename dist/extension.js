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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ignore_1 = __importDefault(require("ignore"));
const MAX_CHUNK_SIZE = 500000; // ~500 KB per chunk
function activate(context) {
    const disposable = vscode.commands.registerCommand("extension.exportCodeToText", (uri) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const folderUri = (uri === null || uri === void 0 ? void 0 : uri.fsPath) || ((_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath);
        if (!folderUri) {
            vscode.window.showErrorMessage("No folder selected.");
            return;
        }
        const config = vscode.workspace.getConfiguration("codeToTxtExporter");
        const defaultExtensions = config.get("defaultExtensions", [".ts", ".js", ".py"]);
        const outputFormatDefault = config.get("outputFormat", ".md");
        const openAfterExport = config.get("openAfterExport", true);
        const copyToClipboard = config.get("copyToClipboard", false);
        const compactMode = config.get("compactMode", false);
        const rawFiles = getAllFiles(folderUri);
        const allExtensions = Array.from(new Set(rawFiles.map((f) => path.extname(f)).filter((e) => e))).sort();
        const selectedExtensions = yield vscode.window.showQuickPick(allExtensions, {
            canPickMany: true,
            title: "Select extensions to include in export",
            placeHolder: defaultExtensions.join(", ")
        });
        if (!selectedExtensions || selectedExtensions.length === 0)
            return;
        const outputFormat = (yield vscode.window.showQuickPick([".txt", ".md"], {
            placeHolder: "Select export format"
        })) || outputFormatDefault;
        const defaultFileName = `${path.basename(folderUri)}-code${outputFormat}`;
        const customFileName = yield vscode.window.showInputBox({
            prompt: "Enter output file name",
            value: defaultFileName,
            validateInput: (val) => /[<>:"/\\|?*]/.test(val) ? "Filename contains invalid characters." : null
        });
        if (!customFileName)
            return;
        const outputUri = yield vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(folderUri, customFileName)),
            filters: {
                [outputFormat === ".md" ? "Markdown" : "Text"]: [outputFormat.replace(".", "")]
            }
        });
        if (!outputUri)
            return;
        const outputPath = outputUri.fsPath;
        const gitignorePath = path.join(folderUri, ".gitignore");
        let ig = (0, ignore_1.default)();
        if (fs.existsSync(gitignorePath)) {
            const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
            ig = (0, ignore_1.default)().add(gitignoreContent);
        }
        const filteredFiles = rawFiles.filter((file) => {
            const relative = path.relative(folderUri, file);
            return (selectedExtensions.includes(path.extname(file)) &&
                !ig.ignores(relative));
        });
        let chunkIndex = 0;
        let buffer = "";
        let writtenFiles = 0;
        let skippedFiles = 0;
        yield vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Exporting code...",
            cancellable: false
        }, (progress) => __awaiter(this, void 0, void 0, function* () {
            for (let i = 0; i < filteredFiles.length; i++) {
                const file = filteredFiles[i];
                try {
                    let content = fs.readFileSync(file, "utf8");
                    if (compactMode)
                        content = content.replace(/\s+/g, " ");
                    const relativePath = path.relative(folderUri, file);
                    const formatted = outputFormat === ".md"
                        ? `\n\n## ${relativePath}\n\n\`\`\`${path.extname(file).replace(".", "")}\n${content}\n\`\`\``
                        : `\n\n================ ${relativePath} ================\n\n${content}`;
                    if ((buffer.length + formatted.length) > MAX_CHUNK_SIZE) {
                        const chunkPath = outputPath.replace(outputFormat, `-part${++chunkIndex}${outputFormat}`);
                        fs.writeFileSync(chunkPath, buffer, "utf8");
                        buffer = "";
                    }
                    buffer += formatted;
                    writtenFiles++;
                }
                catch (err) {
                    skippedFiles++;
                }
                progress.report({ increment: ((i + 1) / filteredFiles.length) * 100 });
            }
            if (buffer.length > 0) {
                const finalPath = chunkIndex > 0
                    ? outputPath.replace(outputFormat, `-part${++chunkIndex}${outputFormat}`)
                    : outputPath;
                fs.writeFileSync(finalPath, buffer, "utf8");
            }
        }));
        if (copyToClipboard) {
            const clipboardContent = fs.readFileSync(outputPath.replace(outputFormat, chunkIndex > 0 ? `-part1${outputFormat}` : outputFormat), "utf8");
            yield vscode.env.clipboard.writeText(clipboardContent);
        }
        const action = openAfterExport
            ? yield vscode.window.showInformationMessage(`Code exported to: ${outputPath}\nFiles written: ${writtenFiles}, skipped: ${skippedFiles}`, "Open File")
            : yield vscode.window.showInformationMessage(`Code exported to: ${outputPath}\nFiles written: ${writtenFiles}, skipped: ${skippedFiles}`);
        if (action === "Open File") {
            vscode.window.showTextDocument(vscode.Uri.file(outputPath));
        }
    }));
    context.subscriptions.push(disposable);
}
function getAllFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
        .filter((file) => !file.isDirectory())
        .map((file) => path.join(dir, file.name));
    const folders = entries.filter((folder) => folder.isDirectory());
    for (const folder of folders) {
        files.push(...getAllFiles(path.join(dir, folder.name)));
    }
    return files;
}
function deactivate() { }
