import * as vscode from "vscode";
import type { TemplateOption, WebviewInitData } from "./webview";

export interface ProfileManagerInitData {
  profiles: WebviewInitData["profiles"];
  templates: TemplateOption[];
}

export async function showProfileManagerWebview(
  context: vscode.ExtensionContext,
  initData: ProfileManagerInitData
): Promise<WebviewInitData["profiles"] | null> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "codeDumpProfiles",
      "Code Dump: Manage Profiles",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")]
      }
    );

    const nonce = getNonce();
    panel.webview.html = buildProfileManagerHtml(panel.webview, context.extensionUri, initData, nonce);

    const disposables: vscode.Disposable[] = [];
    let resolved = false;

    disposables.push(
      panel.webview.onDidReceiveMessage(async (message) => {
        if (!message || typeof message.type !== "string") return;

        switch (message.type) {
          case "cancel":
            dispose();
            resolve(null);
            return;
          case "saveProfiles": {
            const profiles = Array.isArray(message.profiles)
              ? message.profiles
                  .filter((profile: unknown) => typeof profile === "object" && profile !== null)
                  .map((profile: any) => ({
                    id: String(profile.id || "").trim(),
                    name: String(profile.name || "").trim(),
                    extensions: Array.isArray(profile.extensions)
                      ? profile.extensions.filter((ext: unknown) => typeof ext === "string")
                      : undefined,
                    template: typeof profile.template === "string" ? profile.template : undefined,
                    outputFormat: typeof profile.outputFormat === "string" ? profile.outputFormat : undefined,
                    skipEmpty: typeof profile.skipEmpty === "boolean" ? profile.skipEmpty : undefined,
                    showPreview: typeof profile.showPreview === "boolean" ? profile.showPreview : undefined,
                    exportPreset: profile.exportPreset === "ai-pack" ? "ai-pack" : profile.exportPreset === "standard" ? "standard" : undefined,
                    privacyModeEnabled: typeof profile.privacyModeEnabled === "boolean" ? profile.privacyModeEnabled : undefined
                  }))
                  .filter((profile: any) => profile.id && profile.name)
              : [];

            await vscode.workspace
              .getConfiguration("codeDump")
              .update("userProfiles", profiles, vscode.ConfigurationTarget.Global);

            panel.webview.postMessage({ type: "saved" });
            if (!resolved) {
              resolved = true;
              resolve(profiles);
            }
            return;
          }
        }
      })
    );

    panel.onDidDispose(() => {
      dispose();
      if (!resolved) resolve(null);
    }, null, disposables);

    function dispose(): void {
      while (disposables.length) {
        const d = disposables.pop();
        if (d) d.dispose();
      }
    }
  });
}

function buildProfileManagerHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  initData: ProfileManagerInitData,
  nonce: string
): string {
  const data = JSON.stringify(initData).replace(/</g, "\\u003c");
  const mediaRoot = vscode.Uri.joinPath(extensionUri, "media");
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "style.css"));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "profileManager.js"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Dump: Manage Profiles</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <script nonce="${nonce}">
    window.__INIT__ = ${data};
  </script>

  <h1>Manage Profiles</h1>

  <div class="section summary" id="profileSummary">Use profiles to prefill export settings.</div>

  <div class="section profile-manager">
    <div class="profile-list">
      <div class="row row-between">
        <strong>Profiles</strong>
        <div class="row">
          <button id="newProfile" class="secondary">New</button>
          <button id="duplicateProfile" class="secondary">Duplicate</button>
          <button id="deleteProfile" class="secondary">Delete</button>
        </div>
      </div>
      <ul id="profileList"></ul>
    </div>
    <div class="profile-editor">
      <div class="row gap-16">
        <div class="field-block">
          <label>Profile ID</label>
          <input type="text" id="profileId" placeholder="frontend" />
        </div>
        <div class="field-block">
          <label>Name</label>
          <input type="text" id="profileName" placeholder="Frontend" />
        </div>
      </div>

      <div class="row gap-16 mt-8">
        <div class="field-block field-block--wide">
          <label>Extensions (comma separated)</label>
          <input type="text" id="profileExtensions" placeholder=".ts, .tsx, .vue" />
        </div>
        <div class="field-block">
          <label>Template</label>
          <select id="profileTemplate"></select>
        </div>
        <div class="field-block field-block--narrow">
          <label>Output format</label>
          <select id="profileFormat">
            <option value="">(default)</option>
            <option value=".md">.md</option>
            <option value=".txt">.txt</option>
            <option value=".json">.json</option>
            <option value=".pdf">.pdf</option>
          </select>
        </div>
      </div>

      <div class="row mt-8">
        <label><input type="checkbox" id="profileSkipEmpty"> Exclude empty files</label>
        <label><input type="checkbox" id="profileShowPreview"> Preview files</label>
        <label><input type="checkbox" id="profilePrivacy"> Privacy mode</label>
        <label><input type="checkbox" id="profileAiPack"> AI Pack preset</label>
      </div>

      <div class="error" id="profileError"></div>

      <div class="actions">
        <button id="cancelProfiles" class="secondary">Cancel</button>
        <button id="saveProfiles">Save</button>
      </div>
    </div>
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
