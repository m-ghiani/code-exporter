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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function activate(context) {
    const disposable = vscode.commands.registerCommand('extension.exportCodeToText', () => __awaiter(this, void 0, void 0, function* () {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage("No workspace folder open.");
            return;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const projectName = path.basename(rootPath);
        const input = yield vscode.window.showInputBox({
            prompt: 'Enter extensions to include (comma separated, e.g., .ts,.js,.py)',
            value: '.ts,.js'
        });
        if (!input)
            return;
        const extensions = input.split(',').map(e => e.trim());
        const allFiles = getAllFiles(rootPath).filter(file => extensions.includes(path.extname(file)));
        let output = '';
        for (const file of allFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const relativePath = path.relative(rootPath, file);
                output += `\n\n================ ${relativePath} ================\n\n`;
                output += content;
            }
            catch (err) {
                vscode.window.showWarningMessage(`Could not read file: ${file}`);
            }
        }
        const outputPath = path.join(rootPath, `${projectName}-code.txt`);
        fs.writeFileSync(outputPath, output, 'utf8');
        vscode.window.showInformationMessage(`Code exported to: ${outputPath}`);
    }));
    context.subscriptions.push(disposable);
}
function getAllFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
        .filter(file => !file.isDirectory())
        .map(file => path.join(dir, file.name));
    const folders = entries.filter(folder => folder.isDirectory());
    for (const folder of folders) {
        files.push(...getAllFiles(path.join(dir, folder.name)));
    }
    return files;
}
function deactivate() { }
