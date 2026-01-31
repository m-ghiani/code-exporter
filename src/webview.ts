import * as vscode from "vscode";

export interface TemplateOption {
  key: string;
  name: string;
  withMetadata: boolean;
}

export interface WebviewInitData {
  extensions: string[];
  templates: TemplateOption[];
  preselectedExtensions: string[];
  selectedTemplate: string;
  exportPreset: "standard" | "ai-pack";
  profiles: Array<{
    id: string;
    name: string;
    extensions?: string[];
    template?: string;
    outputFormat?: string;
    skipEmpty?: boolean;
    showPreview?: boolean;
    exportPreset?: "standard" | "ai-pack";
    privacyModeEnabled?: boolean;
  }>;
  selectedProfileId: string;
  privacyModeEnabled: boolean;
  openAfterExport: boolean;
  notebooklmUploadAvailable: boolean;
  notebooklmUploadEnabled: boolean;
  skipEmpty: boolean;
  outputFormat: string;
  defaultFileName: string;
  defaultOutputPath: string;
  showPreview: boolean;
  dryRun: boolean;
}

export interface WebviewSelections {
  selectedExtensions: string[];
  selectedTemplate: string;
  exportPreset: "standard" | "ai-pack";
  selectedProfileId: string;
  privacyModeEnabled: boolean;
  openAfterExport: boolean;
  notebooklmUploadEnabled: boolean;
  skipEmpty: boolean;
  outputFormat: string;
  outputPath: string;
  showPreview: boolean;
}

export interface WebviewSession {
  selections: WebviewSelections;
  appendLog: (message: string) => void;
  dispose: () => void;
}

class WebviewPanelManager {
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private resolved = false;

  constructor(
    private context: vscode.ExtensionContext,
    private initData: WebviewInitData,
    private resolve: (value: WebviewSession | null) => void
  ) {
    this.panel = this.createPanel();
    this.attachListeners();
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      "codeDumpExport",
      "Code Dump Export",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
      }
    );

    const nonce = getNonce();
    panel.webview.html = buildWebviewHtml(panel.webview, this.context.extensionUri, this.initData, nonce);

    return panel;
  }

  private attachListeners(): void {
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(async (message) => {
        if (!message || typeof message.type !== "string") return;

        switch (message.type) {
          case "cancel":
            this.dispose();
            this.resolve(null);
            return;
          case "chooseOutput": {
            const outputFormat = message.outputFormat || this.initData.outputFormat;
            const filterName = outputFormat === ".md"
              ? "Markdown"
              : outputFormat === ".json"
                ? "JSON"
                : outputFormat === ".pdf"
                  ? "PDF"
                  : "Text";
            const defaultPath = message.defaultPath || this.initData.defaultOutputPath;
            const outputUri = await vscode.window.showSaveDialog({
              defaultUri: vscode.Uri.file(defaultPath),
              filters: { [filterName]: [outputFormat.replace(".", "")] }
            });

            if (outputUri) {
              this.panel.webview.postMessage({ type: "outputChosen", outputPath: outputUri.fsPath });
            }
            return;
          }
          case "copyPath": {
            const targetPath = typeof message.outputPath === "string"
              ? message.outputPath
              : this.initData.defaultOutputPath;
            await vscode.env.clipboard.writeText(targetPath);
            this.panel.webview.postMessage({ type: "copiedPath" });
            return;
          }
          case "submit": {
            const selectedExtensions = Array.isArray(message.selectedExtensions)
              ? message.selectedExtensions.filter((e: unknown) => typeof e === "string")
              : [];

            if (selectedExtensions.length === 0) {
              this.panel.webview.postMessage({
                type: "error",
                message: "Select at least one file extension."
              });
              return;
            }

            const selections: WebviewSelections = {
              selectedExtensions,
              selectedTemplate: typeof message.selectedTemplate === "string"
                ? message.selectedTemplate
                : this.initData.selectedTemplate,
              exportPreset: message.exportPreset === "ai-pack" ? "ai-pack" : "standard",
              selectedProfileId: typeof message.selectedProfileId === "string"
                ? message.selectedProfileId
                : this.initData.selectedProfileId,
              privacyModeEnabled: Boolean(message.privacyModeEnabled),
              openAfterExport: Boolean(message.openAfterExport),
              notebooklmUploadEnabled: Boolean(message.notebooklmUploadEnabled),
              skipEmpty: Boolean(message.skipEmpty),
              outputFormat: typeof message.outputFormat === "string"
                ? message.outputFormat
                : this.initData.outputFormat,
              outputPath: typeof message.outputPath === "string"
                ? message.outputPath
                : this.initData.defaultOutputPath,
              showPreview: Boolean(message.showPreview)
            };

            if (!this.initData.dryRun && (!selections.outputPath || selections.outputPath.trim().length === 0)) {
              this.panel.webview.postMessage({
                type: "error",
                message: "Choose an output path."
              });
              return;
            }

            this.panel.webview.postMessage({ type: "setExporting", exporting: true });
            if (!this.resolved) {
              this.resolved = true;
              this.resolve({
                selections,
                appendLog: (message: string) => this.appendLog(message),
                dispose: () => this.panel.dispose()
              });
            }
            return;
          }
        }
      })
    );

    this.panel.onDidDispose(() => {
      this.dispose();
      if (!this.resolved) this.resolve(null);
    }, null, this.disposables);
  }

  private appendLog(message: string): void {
    this.panel.webview.postMessage({ type: "appendLog", message });
  }

  private dispose(): void {
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
}

export async function showExportWebview(
  context: vscode.ExtensionContext,
  initData: WebviewInitData
): Promise<WebviewSession | null> {
  return new Promise((resolve) => {
    new WebviewPanelManager(context, initData, resolve);
  });
}

function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  initData: WebviewInitData,
  nonce: string
): string {
  const data = encodeURIComponent(JSON.stringify(initData));
  const mediaRoot = vscode.Uri.joinPath(extensionUri, "media");
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "style.css"));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "main.js"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Dump Export</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body data-init="${data}">
  <h1>Code Dump Export</h1>

  <div class="section summary" id="summaryText"></div>

  <details class="section" open>
    <summary class="section-header">
      <strong>Base</strong>
    </summary>
    <div class="collapsible-body">
      <div class="row row-between">
        <strong>File extensions</strong>
        <div class="extensions-toolbar">
          <input type="text" id="extensionSearch" placeholder="Search extensions">
          <label><input type="checkbox" id="showSelectedOnly"> Selected only</label>
          <button id="selectAll" class="secondary">Select all</button>
          <button id="clearAll" class="secondary">Clear</button>
        </div>
      </div>
      <div class="extensions" id="extensionsList"></div>

      <div class="row gap-16 mt-8">
        <div class="field-block">
          <label>Profile</label>
          <select id="profileSelect"></select>
          <div class="muted mt-4" id="profileHint"></div>
        </div>
        <div class="field-block">
          <label>Preset</label>
          <select id="presetSelect">
            <option value="standard">Standard</option>
            <option value="ai-pack">AI Export Pack</option>
          </select>
          <div class="muted mt-4" id="presetHint"></div>
        </div>
        <div class="field-block field-block--wide">
          <label>Template</label>
          <div class="row">
            <select id="templateSelect"></select>
            <span class="badge hidden" id="templateLockBadge">Locked by preset</span>
          </div>
        </div>
        <div class="field-block field-block--narrow">
          <label>Output format</label>
          <div class="row">
            <select id="formatSelect">
              <option value=".md">.md</option>
              <option value=".txt">.txt</option>
              <option value=".json">.json</option>
              <option value=".pdf">.pdf</option>
            </select>
            <span class="badge hidden" id="formatLockBadge">Locked by preset</span>
          </div>
        </div>
      </div>
    </div>
  </details>

  <details class="section" open>
    <summary class="section-header">
      <strong>Advanced</strong>
    </summary>
    <div class="collapsible-body">
      <div class="row mt-8">
        <label><input type="checkbox" id="skipEmpty"> Exclude empty files</label>
        <label><input type="checkbox" id="showPreview"> Preview files before export</label>
        <label><input type="checkbox" id="openAfterExport"> Open file after export</label>
        <span class="muted hidden" id="dryRunBadge">Dry run enabled<span class="pill">no file will be written</span></span>
      </div>

      <div class="section" id="outputSection">
        <div class="path-row">
          <div>
            <label>Output path</label>
            <input type="text" id="outputPath" readonly>
            <select id="recentPaths" class="mt-4"></select>
          </div>
          <div>
            <button id="choosePath">Choose…</button>
          </div>
          <div>
            <button id="copyPath" class="secondary">Copy</button>
          </div>
        </div>
      </div>
    </div>
  </details>

  <details class="section" open>
    <summary class="section-header">
      <strong>AI & NotebookLM</strong>
    </summary>
    <div class="collapsible-body">
      <div class="row mt-8">
        <label><input type="checkbox" id="privacyMode"> Privacy mode (mask sensitive)</label>
        <label><input type="checkbox" id="notebooklmUpload"> Upload to NotebookLM (Enterprise)</label>
        <span class="muted" id="notebooklmHint"></span>
      </div>
    </div>
  </details>

  <div class="error" id="errorBox"></div>

  <div class="section">
    <div class="row row-between">
      <strong>Operation log</strong>
      <div class="log-toolbar">
        <label class="muted">Level</label>
        <select id="logLevel">
          <option value="info">Info</option>
          <option value="verbose">Verbose</option>
        </select>
        <span class="muted" id="logStatus">Idle</span>
      </div>
    </div>
    <textarea id="logOutput" class="log-box" readonly></textarea>
  </div>

  <div class="actions">
    <button id="cancelBtn" class="secondary">Cancel</button>
    <button id="exportBtn">Export</button>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
