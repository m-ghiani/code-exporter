(() => {
  const vscode = acquireVsCodeApi();
  const initData = window.__INIT__ || {};

  const elements = {
    extensionsList: document.getElementById("extensionsList"),
    profileSelect: document.getElementById("profileSelect"),
    profileHint: document.getElementById("profileHint"),
    presetSelect: document.getElementById("presetSelect"),
    templateSelect: document.getElementById("templateSelect"),
    formatSelect: document.getElementById("formatSelect"),
    outputPathInput: document.getElementById("outputPath"),
    choosePathBtn: document.getElementById("choosePath"),
    skipEmptyCheckbox: document.getElementById("skipEmpty"),
    showPreviewCheckbox: document.getElementById("showPreview"),
    privacyModeCheckbox: document.getElementById("privacyMode"),
    openAfterExportCheckbox: document.getElementById("openAfterExport"),
    notebooklmUploadCheckbox: document.getElementById("notebooklmUpload"),
    notebooklmHint: document.getElementById("notebooklmHint"),
    dryRunBadge: document.getElementById("dryRunBadge"),
    outputSection: document.getElementById("outputSection"),
    errorBox: document.getElementById("errorBox"),
    presetHint: document.getElementById("presetHint"),
    logOutput: document.getElementById("logOutput"),
    logStatus: document.getElementById("logStatus"),
    logLevel: document.getElementById("logLevel"),
    summaryText: document.getElementById("summaryText"),
    extensionSearch: document.getElementById("extensionSearch"),
    showSelectedOnly: document.getElementById("showSelectedOnly"),
    recentPaths: document.getElementById("recentPaths"),
    templateLockBadge: document.getElementById("templateLockBadge"),
    formatLockBadge: document.getElementById("formatLockBadge"),
    manageProfiles: document.getElementById("manageProfiles"),
    selectAllBtn: document.getElementById("selectAll"),
    clearAllBtn: document.getElementById("clearAll"),
    copyPathBtn: document.getElementById("copyPath"),
    cancelBtn: document.getElementById("cancelBtn"),
    exportBtn: document.getElementById("exportBtn")
  };

  const state = {
    outputPathCustom: false,
    logEntries: [],
    logLevel: "info",
    recentPaths: []
  };

  const logLevels = {
    INFO: "info",
    VERBOSE: "verbose"
  };

  function setError(message) {
    elements.errorBox.textContent = message || "";
  }

  function appendLog(message) {
    const time = new Date().toLocaleTimeString();
    const entry = normalizeLogEntry(message, time);
    state.logEntries.push(entry);
    renderLog();
  }

  function normalizeLogEntry(message, time) {
    if (typeof message !== "string") return { level: logLevels.INFO, text: "", time };
    if (message.startsWith("VERBOSE:")) {
      return { level: logLevels.VERBOSE, text: message.replace(/^VERBOSE:\s*/, ""), time };
    }
    return { level: logLevels.INFO, text: message, time };
  }

  function renderLog() {
    const filtered = state.logEntries.filter((entry) => {
      if (state.logLevel === logLevels.VERBOSE) return true;
      return entry.level === logLevels.INFO;
    });
    elements.logOutput.value = filtered.map((entry) => `[${entry.time}] ${entry.text}`).join("\n") + (filtered.length ? "\n" : "");
    elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
  }

  function setExportingState(isExporting) {
    elements.logStatus.textContent = isExporting ? "Running" : "Idle";
    document.querySelectorAll("input, select, button").forEach((el) => {
      if (el.id === "copyPath" || el.id === "cancelBtn") return;
      el.disabled = isExporting;
    });
    if (isExporting) {
      appendLog("Export started");
    }
  }

  function buildExtensions() {
    let selected = new Set(getSelectedExtensions());
    if (selected.size === 0 && Array.isArray(initData.preselectedExtensions)) {
      selected = new Set(initData.preselectedExtensions);
    }
    const items = (initData.extensions && initData.extensions.length)
      ? initData.extensions
      : (initData.preselectedExtensions || []);
    const query = elements.extensionSearch.value.trim().toLowerCase();
    const showSelectedOnly = elements.showSelectedOnly.checked;

    elements.extensionsList.innerHTML = "";
    items
      .filter((ext) => {
        if (showSelectedOnly && !selected.has(ext)) return false;
        if (!query) return true;
        return ext.toLowerCase().includes(query);
      })
      .forEach((ext) => {
        const id = `ext_${ext.replace(/[^a-zA-Z0-9]/g, "")}`;
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" data-ext="${ext}" id="${id}"> ${ext}`;
        const input = label.querySelector("input");
        if (selected.has(ext)) input.checked = true;
        elements.extensionsList.appendChild(label);
      });
  }

  function buildTemplates() {
    elements.templateSelect.innerHTML = "";
    (initData.templates || []).forEach((template) => {
      const opt = document.createElement("option");
      opt.value = template.key;
      opt.textContent = template.name;
      elements.templateSelect.appendChild(opt);
    });
    elements.templateSelect.value = initData.selectedTemplate || "";
  }

  function buildProfiles() {
    elements.profileSelect.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "default";
    defaultOpt.textContent = "Default";
    elements.profileSelect.appendChild(defaultOpt);
    (initData.profiles || []).forEach((profile) => {
      const opt = document.createElement("option");
      opt.value = profile.id;
      opt.textContent = profile.name;
      elements.profileSelect.appendChild(opt);
    });
    elements.profileSelect.value = initData.selectedProfileId || "default";
  }

  function setExtensions(extensions) {
    if (!Array.isArray(extensions) || extensions.length === 0) return;
    const selected = new Set(extensions);
    elements.extensionsList.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      const ext = el.getAttribute("data-ext");
      el.checked = selected.has(ext);
    });
  }

  function applyFields(patch) {
    if (!patch) return;
    if (Array.isArray(patch.extensions)) setExtensions(patch.extensions);
    if (patch.template) elements.templateSelect.value = patch.template;
    if (patch.outputFormat) elements.formatSelect.value = patch.outputFormat;
    if (typeof patch.skipEmpty === "boolean") elements.skipEmptyCheckbox.checked = patch.skipEmpty;
    if (typeof patch.showPreview === "boolean") elements.showPreviewCheckbox.checked = patch.showPreview;
    if (typeof patch.privacyModeEnabled === "boolean") elements.privacyModeCheckbox.checked = patch.privacyModeEnabled;
  }

  function applyPreset(preset) {
    if (preset === "ai-pack") {
      elements.presetHint.textContent = "Exports JSON + MD with context summary and AI prompt.";
      elements.templateSelect.value = "ai-ready";
      elements.templateSelect.disabled = true;
      elements.formatSelect.value = ".json";
      elements.formatSelect.disabled = true;
      elements.skipEmptyCheckbox.checked = true;
      elements.showPreviewCheckbox.checked = true;
      elements.templateLockBadge.classList.remove("hidden");
      elements.formatLockBadge.classList.remove("hidden");
    } else {
      elements.presetHint.textContent = "";
      elements.templateSelect.disabled = false;
      elements.formatSelect.disabled = false;
      elements.templateLockBadge.classList.add("hidden");
      elements.formatLockBadge.classList.add("hidden");
    }
    updateDefaultPath();
    updateSummary();
  }

  function applyProfile(profileId) {
    if (profileId === "default") {
      elements.profileHint.textContent = "";
      updateSummary();
      return;
    }
    const profile = (initData.profiles || []).find((item) => item.id === profileId);
    if (!profile) return;
    elements.profileHint.textContent = "Profile preset applied";

    applyFields(profile);

    if (profile.exportPreset) {
      elements.presetSelect.value = profile.exportPreset;
      applyPreset(profile.exportPreset);
    }

    updateDefaultPath();
    updateSummary();
  }

  function normalizePathForFormat(inputPath, format) {
    if (!inputPath) return initData.defaultOutputPath;
    if (inputPath.endsWith(format)) return inputPath;
    return inputPath.replace(/\.[^/.]+$/, "") + format;
  }

  function updateDefaultPath() {
    if (state.outputPathCustom || initData.dryRun) return;
    const format = elements.formatSelect.value || initData.outputFormat;
    elements.outputPathInput.value = normalizePathForFormat(initData.defaultOutputPath, format);
    updateSummary();
  }

  function getSelectedExtensions() {
    const selected = [];
    elements.extensionsList.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      if (el.checked) selected.push(el.getAttribute("data-ext"));
    });
    return selected;
  }

  function updateSummary() {
    const extensionsCount = getSelectedExtensions().length;
    const preset = elements.presetSelect.value;
    const format = elements.formatSelect.value;
    const template = elements.templateSelect.value;
    const profile = elements.profileSelect.value;
    elements.summaryText.textContent =
      `${extensionsCount} extensions selected • preset: ${preset} • format: ${format} • template: ${template} • profile: ${profile}`;
  }

  function loadRecentPaths() {
    const saved = vscode.getState();
    const stored = saved && Array.isArray(saved.recentPaths) ? saved.recentPaths : [];
    const unique = [initData.defaultOutputPath, ...stored].filter(Boolean).filter((value, index, self) => self.indexOf(value) === index);
    state.recentPaths = unique.slice(0, 5);
    renderRecentPaths();
  }

  function renderRecentPaths() {
    elements.recentPaths.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Recent paths";
    elements.recentPaths.appendChild(placeholder);

    state.recentPaths.forEach((pathValue) => {
      const opt = document.createElement("option");
      opt.value = pathValue;
      opt.textContent = pathValue;
      elements.recentPaths.appendChild(opt);
    });
  }

  function saveRecentPath(pathValue) {
    if (!pathValue) return;
    const next = [pathValue, ...state.recentPaths].filter((value, index, self) => self.indexOf(value) === index);
    state.recentPaths = next.slice(0, 5);
    vscode.setState({ recentPaths: state.recentPaths });
    renderRecentPaths();
  }

  elements.selectAllBtn.addEventListener("click", () => {
    elements.extensionsList.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      el.checked = true;
    });
    updateSummary();
  });

  elements.clearAllBtn.addEventListener("click", () => {
    elements.extensionsList.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      el.checked = false;
    });
    updateSummary();
  });

  elements.extensionsList.addEventListener("change", (event) => {
    if (event.target && event.target.matches('input[type="checkbox"]')) {
      updateSummary();
    }
  });

  elements.extensionSearch.addEventListener("input", () => {
    buildExtensions();
  });

  elements.showSelectedOnly.addEventListener("change", () => {
    buildExtensions();
  });

  elements.logLevel.addEventListener("change", () => {
    state.logLevel = elements.logLevel.value;
    renderLog();
  });

  elements.choosePathBtn.addEventListener("click", () => {
    vscode.postMessage({
      type: "chooseOutput",
      outputFormat: elements.formatSelect.value,
      defaultPath: elements.outputPathInput.value || initData.defaultOutputPath
    });
  });

  elements.copyPathBtn.addEventListener("click", () => {
    const outputPath = elements.outputPathInput.value || initData.defaultOutputPath;
    vscode.postMessage({ type: "copyPath", outputPath });
  });

  elements.formatSelect.addEventListener("change", () => {
    updateDefaultPath();
  });

  elements.templateSelect.addEventListener("change", () => {
    updateSummary();
  });

  elements.presetSelect.addEventListener("change", () => {
    applyPreset(elements.presetSelect.value);
  });

  elements.profileSelect.addEventListener("change", () => {
    applyProfile(elements.profileSelect.value);
  });

  elements.manageProfiles.addEventListener("click", () => {
    vscode.postMessage({ type: "openProfileManager" });
  });

  elements.recentPaths.addEventListener("change", () => {
    if (!elements.recentPaths.value) return;
    state.outputPathCustom = true;
    elements.outputPathInput.value = elements.recentPaths.value;
    updateSummary();
  });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || !message.type) return;
    if (message.type === "outputChosen") {
      state.outputPathCustom = true;
      elements.outputPathInput.value = message.outputPath;
      setError("");
      saveRecentPath(message.outputPath);
      updateSummary();
    }
    if (message.type === "copiedPath") {
      setError("Path copied to clipboard.");
      setTimeout(() => setError(""), 1500);
    }
    if (message.type === "appendLog" && typeof message.message === "string") {
      appendLog(message.message);
    }
    if (message.type === "profilesUpdated" && Array.isArray(message.profiles)) {
      initData.profiles = message.profiles;
      buildProfiles();
      if (!message.profiles.some((profile) => profile.id === elements.profileSelect.value)) {
        elements.profileSelect.value = "default";
      }
      applyProfile(elements.profileSelect.value);
      updateSummary();
    }
    if (message.type === "setExporting") {
      setExportingState(Boolean(message.exporting));
    }
    if (message.type === "error") {
      setError(message.message);
    }
  });

  elements.cancelBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "cancel" });
  });

  elements.exportBtn.addEventListener("click", () => {
    const selectedExtensions = getSelectedExtensions();
    if (selectedExtensions.length === 0) {
      setError("Select at least one file extension.");
      return;
    }
    const outputPath = elements.outputPathInput.value || initData.defaultOutputPath;
    vscode.postMessage({
      type: "submit",
      selectedExtensions,
      selectedTemplate: elements.templateSelect.value,
      exportPreset: elements.presetSelect.value,
      selectedProfileId: elements.profileSelect.value,
      privacyModeEnabled: elements.privacyModeCheckbox.checked,
      openAfterExport: elements.openAfterExportCheckbox.checked,
      notebooklmUploadEnabled: elements.notebooklmUploadCheckbox.checked,
      skipEmpty: elements.skipEmptyCheckbox.checked,
      outputFormat: elements.formatSelect.value,
      outputPath,
      showPreview: elements.showPreviewCheckbox.checked
    });
    saveRecentPath(outputPath);
  });

  buildExtensions();
  buildProfiles();
  buildTemplates();
  elements.formatSelect.value = initData.outputFormat || ".md";
  elements.skipEmptyCheckbox.checked = Boolean(initData.skipEmpty);
  elements.showPreviewCheckbox.checked = Boolean(initData.showPreview);
  elements.privacyModeCheckbox.checked = Boolean(initData.privacyModeEnabled);
  elements.openAfterExportCheckbox.checked = Boolean(initData.openAfterExport);
  elements.notebooklmUploadCheckbox.checked = Boolean(initData.notebooklmUploadEnabled);
  elements.notebooklmUploadCheckbox.disabled = !initData.notebooklmUploadAvailable;
  elements.notebooklmHint.textContent = initData.notebooklmUploadAvailable
    ? ""
    : "Configure NotebookLM Enterprise settings to enable uploads.";
  elements.outputPathInput.value = initData.defaultOutputPath || "";
  elements.presetSelect.value = initData.exportPreset || "standard";
  applyPreset(elements.presetSelect.value);
  applyProfile(elements.profileSelect.value);
  appendLog("Ready");
  loadRecentPaths();
  updateSummary();

  if (initData.dryRun) {
    elements.dryRunBadge.classList.remove("hidden");
    elements.outputSection.classList.add("hidden");
  } else {
    updateDefaultPath();
  }
})();
