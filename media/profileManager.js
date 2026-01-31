(() => {
  const vscode = acquireVsCodeApi();
  const initData = window.__INIT__ || {};

  const elements = {
    profileList: document.getElementById("profileList"),
    profileId: document.getElementById("profileId"),
    profileName: document.getElementById("profileName"),
    profileExtensions: document.getElementById("profileExtensions"),
    profileTemplate: document.getElementById("profileTemplate"),
    profileFormat: document.getElementById("profileFormat"),
    profileSkipEmpty: document.getElementById("profileSkipEmpty"),
    profileShowPreview: document.getElementById("profileShowPreview"),
    profilePrivacy: document.getElementById("profilePrivacy"),
    profileAiPack: document.getElementById("profileAiPack"),
    profileError: document.getElementById("profileError"),
    newProfile: document.getElementById("newProfile"),
    duplicateProfile: document.getElementById("duplicateProfile"),
    deleteProfile: document.getElementById("deleteProfile"),
    cancelProfiles: document.getElementById("cancelProfiles"),
    saveProfiles: document.getElementById("saveProfiles")
  };

  const state = {
    profiles: Array.isArray(initData.profiles) ? initData.profiles.map(cloneProfile) : [],
    selectedIndex: 0
  };

  function cloneProfile(profile) {
    return {
      id: profile.id || "",
      name: profile.name || "",
      extensions: Array.isArray(profile.extensions) ? [...profile.extensions] : [],
      template: profile.template || "",
      outputFormat: profile.outputFormat || "",
      skipEmpty: Boolean(profile.skipEmpty),
      showPreview: Boolean(profile.showPreview),
      exportPreset: profile.exportPreset || "",
      privacyModeEnabled: Boolean(profile.privacyModeEnabled)
    };
  }

  function buildTemplates() {
    elements.profileTemplate.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "(default)";
    elements.profileTemplate.appendChild(blank);

    (initData.templates || []).forEach((template) => {
      const opt = document.createElement("option");
      opt.value = template.key;
      opt.textContent = template.name;
      elements.profileTemplate.appendChild(opt);
    });
  }

  function renderList() {
    elements.profileList.innerHTML = "";
    state.profiles.forEach((profile, index) => {
      const item = document.createElement("li");
      item.textContent = profile.name || profile.id || "(untitled)";
      item.dataset.index = index;
      if (index === state.selectedIndex) item.classList.add("active");
      elements.profileList.appendChild(item);
    });

    if (state.profiles.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No profiles yet.";
      empty.classList.add("muted");
      elements.profileList.appendChild(empty);
    }
  }

  function selectProfile(index) {
    if (index < 0 || index >= state.profiles.length) {
      clearEditor();
      return;
    }
    state.selectedIndex = index;
    renderList();
    populateEditor(state.profiles[index]);
  }

  function clearEditor() {
    elements.profileId.value = "";
    elements.profileName.value = "";
    elements.profileExtensions.value = "";
    elements.profileTemplate.value = "";
    elements.profileFormat.value = "";
    elements.profileSkipEmpty.checked = false;
    elements.profileShowPreview.checked = false;
    elements.profilePrivacy.checked = false;
    elements.profileAiPack.checked = false;
  }

  function populateEditor(profile) {
    elements.profileId.value = profile.id || "";
    elements.profileName.value = profile.name || "";
    elements.profileExtensions.value = profile.extensions.join(", ");
    elements.profileTemplate.value = profile.template || "";
    elements.profileFormat.value = profile.outputFormat || "";
    elements.profileSkipEmpty.checked = Boolean(profile.skipEmpty);
    elements.profileShowPreview.checked = Boolean(profile.showPreview);
    elements.profilePrivacy.checked = Boolean(profile.privacyModeEnabled);
    elements.profileAiPack.checked = profile.exportPreset === "ai-pack";
  }

  function updateCurrentProfile() {
    if (state.selectedIndex < 0 || state.selectedIndex >= state.profiles.length) return;
    const profile = state.profiles[state.selectedIndex];
    profile.id = elements.profileId.value.trim();
    profile.name = elements.profileName.value.trim();
    profile.extensions = elements.profileExtensions.value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    profile.template = elements.profileTemplate.value || "";
    profile.outputFormat = elements.profileFormat.value || "";
    profile.skipEmpty = elements.profileSkipEmpty.checked;
    profile.showPreview = elements.profileShowPreview.checked;
    profile.privacyModeEnabled = elements.profilePrivacy.checked;
    profile.exportPreset = elements.profileAiPack.checked ? "ai-pack" : "";
  }

  function validateProfiles() {
    const ids = new Set();
    for (const profile of state.profiles) {
      if (!profile.id || !profile.name) {
        return "Profile ID and Name are required.";
      }
      if (ids.has(profile.id)) {
        return `Duplicate profile id: ${profile.id}`;
      }
      ids.add(profile.id);
    }
    return "";
  }

  elements.profileList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    updateCurrentProfile();
    selectProfile(index);
  });

  elements.newProfile.addEventListener("click", () => {
    updateCurrentProfile();
    const newProfile = {
      id: `profile-${state.profiles.length + 1}`,
      name: "New Profile",
      extensions: [],
      template: "",
      outputFormat: "",
      skipEmpty: false,
      showPreview: false,
      exportPreset: "",
      privacyModeEnabled: false
    };
    state.profiles.push(newProfile);
    selectProfile(state.profiles.length - 1);
  });

  elements.duplicateProfile.addEventListener("click", () => {
    if (state.selectedIndex < 0 || state.selectedIndex >= state.profiles.length) return;
    updateCurrentProfile();
    const base = state.profiles[state.selectedIndex];
    const copy = cloneProfile(base);
    copy.id = `${base.id || "profile"}-copy`;
    copy.name = `${base.name || "Profile"} (copy)`;
    state.profiles.push(copy);
    selectProfile(state.profiles.length - 1);
  });

  elements.deleteProfile.addEventListener("click", () => {
    if (state.selectedIndex < 0 || state.selectedIndex >= state.profiles.length) return;
    state.profiles.splice(state.selectedIndex, 1);
    const nextIndex = Math.min(state.selectedIndex, state.profiles.length - 1);
    selectProfile(nextIndex);
  });

  elements.saveProfiles.addEventListener("click", () => {
    updateCurrentProfile();
    const error = validateProfiles();
    if (error) {
      elements.profileError.textContent = error;
      return;
    }
    elements.profileError.textContent = "";
    vscode.postMessage({
      type: "saveProfiles",
      profiles: state.profiles
    });
  });

  elements.cancelProfiles.addEventListener("click", () => {
    vscode.postMessage({ type: "cancel" });
  });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || !message.type) return;
    if (message.type === "saved") {
      elements.profileError.textContent = "Profiles saved.";
      setTimeout(() => {
        elements.profileError.textContent = "";
      }, 1500);
    }
  });

  buildTemplates();
  renderList();
  selectProfile(state.profiles.length ? 0 : -1);
})();
