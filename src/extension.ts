import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('extension.exportCodeToText', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const projectName = path.basename(rootPath);

    const input = await vscode.window.showInputBox({
      prompt: 'Enter extensions to include (comma separated, e.g., .ts,.js,.py)',
      value: '.ts,.js'
    });

    if (!input) return;

    const extensions = input.split(',').map(e => e.trim());

    const allFiles = getAllFiles(rootPath).filter(file =>
      extensions.includes(path.extname(file))
    );

    let output = '';

    for (const file of allFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const relativePath = path.relative(rootPath, file);
        output += `\n\n================ ${relativePath} ================\n\n`;
        output += content;
      } catch (err) {
        vscode.window.showWarningMessage(`Could not read file: ${file}`);
      }
    }

    const outputPath = path.join(rootPath, `${projectName}-code.txt`);
    fs.writeFileSync(outputPath, output, 'utf8');

    vscode.window.showInformationMessage(`Code exported to: ${outputPath}`);
  });

  context.subscriptions.push(disposable);
}

function getAllFiles(dir: string): string[] {
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

export function deactivate() {}
