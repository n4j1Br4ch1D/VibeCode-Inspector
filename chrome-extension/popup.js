document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const toggleBtn = document.getElementById('toggleBtn');
  const resetBtn = document.getElementById('resetBtn');

  // Check current tab URL
  if (tab && tab.url && tab.url.startsWith('chrome://')) {
    toggleBtn.disabled = true;
    toggleBtn.style.opacity = '0.5';
    toggleBtn.style.cursor = 'not-allowed';
    toggleBtn.title = "Cannot inspect chrome:// pages.";
    toggleBtn.textContent = "Unavailable";
  }

  const configs = VibeCodeConfig.configs;
  const defaultKeys = VibeCodeConfig.getDefaults();
  defaultKeys.vibeCodeEnabled = false;

  const result = await VibeCodeConfig.getSettings();

  const container = document.getElementById('settings-container');
  if (container) {
    container.innerHTML = VibeCodeConfig.generateSettingsHTML(true, result);
  }

  // Tabs logic
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-content-' + btn.dataset.tabtarget).classList.add('active');
    });
  });

  function saveConfig(key, value) {
    chrome.storage.local.set({ [key]: value });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: "configChanged", key, value }).catch(() => { });
    }
  }

  function updateBadgeHighlights(textarea) {
    if (!textarea) return;
    const text = textarea.value;
    const row = textarea.closest('.config-row');
    if (row) {
      row.querySelectorAll('.vibecode-var-badge').forEach(badge => {
        const varName = badge.dataset.var;
        if (text.includes(varName)) {
          badge.classList.add('used');
        } else {
          badge.classList.remove('used');
        }
      });
    }
  }

  for (let key in configs) {
    const el = document.getElementById(configs[key].id);
    if (el) {
      if (el.tagName === 'TEXTAREA') updateBadgeHighlights(el);
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', (e) => {
        let val = e.target.value;
        if (val === "true") val = true; else if (val === "false") val = false;
        saveConfig(key, val);

        if (el.tagName === 'TEXTAREA') updateBadgeHighlights(el);

        if (key === 'hotReloadEnabled' && tab) {
          chrome.tabs.sendMessage(tab.id, { action: "setHotReload", enabled: val }).catch(() => { });
        }
      });
    }
  }

  // Template Editor Switching
  const editorSelect = document.getElementById('vibecode-template-editor-select');
  if (editorSelect) {
    const updateEditor = () => {
      const selectedId = editorSelect.value;
      document.querySelectorAll('.vibecode-template-field').forEach(f => {
        f.style.display = f.dataset.fieldid === selectedId ? 'block' : 'none';
      });
    };
    editorSelect.addEventListener('change', updateEditor);
    updateEditor(); // Init
  }

  // Conditional Row Visibility for Output Target
  const updateOutputRowVisibility = () => {
    const ot = document.getElementById('config-output-target');
    if (!ot) return;
    const target = ot.value;
    const getRow = (id) => document.getElementById(id)?.closest('.config-row');

    const ideRows = ['config-project', 'config-chat-type', 'config-model', 'config-direct-run'].map(getRow);
    const fileRow = getRow('config-task-file');
    const apiRow = getRow('config-webhook-url');
    const mcpRow = getRow('config-mcp-url');
    const cliRow = getRow('config-cli-command');

    ideRows.forEach(r => { if (r) r.style.display = target === 'ide' ? 'flex' : 'none'; });
    if (fileRow) fileRow.style.display = target === 'file' ? 'flex' : 'none';
    if (apiRow) apiRow.style.display = target === 'api' ? 'flex' : 'none';
    if (mcpRow) mcpRow.style.display = target === 'mcp' ? 'flex' : 'none';
    if (cliRow) cliRow.style.display = target === 'cli' ? 'flex' : 'none';
  };

  const otEl = document.getElementById('config-output-target');
  if (otEl) {
    otEl.addEventListener('change', updateOutputRowVisibility);
    updateOutputRowVisibility();
  }



  const btnHistory = document.getElementById('btn-reset-history');
  if (btnHistory) {
    btnHistory.onclick = async () => {
      if (confirm("Clear prompt history?")) {
        chrome.storage.local.set({ promptHistory: [] }, () => window.location.reload());
      }
    };
  }

  const btnTemplates = document.getElementById('btn-reset-templates');
  if (btnTemplates) {
    btnTemplates.onclick = async () => {
      if (confirm("Reset templates to default?")) {
        const def = VibeCodeConfig.configs.promptTemplate.default;
        chrome.storage.local.set({ promptTemplate: def, activeTemplate: 'default' }, () => window.location.reload());
      }
    };
  }

  const btnPresets = document.getElementById('btn-reset-presets');
  if (btnPresets) {
    btnPresets.onclick = async () => {
      if (confirm("Reset preset actions to default?")) {
        const def = VibeCodeConfig.configs.customPresets.default;
        chrome.storage.local.set({ customPresets: def }, () => window.location.reload());
      }
    };
  }

  const btnSettings = document.getElementById('btn-reset-settings');
  if (btnSettings) {
    btnSettings.onclick = async () => {
      if (confirm("Reset all settings (excluding history/templates)?")) {
        const defaults = VibeCodeConfig.getDefaults();
        delete defaults.promptHistory;
        delete defaults.promptTemplate;
        delete defaults.customPresets;
        delete defaults.activeTemplate;
        chrome.storage.local.set(defaults, () => window.location.reload());
      }
    };
  }

  document.querySelectorAll('.vibecode-var-badge').forEach(btn => {
    btn.onclick = (e) => {
      const varText = e.target.dataset.var;
      const tmpl = document.getElementById('config-template');
      if (tmpl) {
        const start = tmpl.selectionStart;
        const end = tmpl.selectionEnd;
        const text = tmpl.value;
        tmpl.value = text.substring(0, start) + varText + text.substring(end);
        tmpl.selectionStart = tmpl.selectionEnd = start + varText.length;
        tmpl.focus();
        saveConfig('promptTemplate', tmpl.value);
      }
    };
  });

  // Check if content script is already injected and active
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "getStatus" });
    if (response && response.isActive) {
      setButtonState(true);
    } else {
      setButtonState(false);
    }
  } catch (e) {
    setButtonState(false);
  }

  toggleBtn.addEventListener('click', async () => {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: "toggleInspector" });
      setButtonState(response.isActive);
    } catch (e) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['config.js', 'content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      setTimeout(async () => {
        const response = await chrome.tabs.sendMessage(tab.id, { action: "toggleInspector" });
        setButtonState(response.isActive);
      }, 100);
    }
  });

  function setButtonState(isActive) {
    chrome.storage.local.set({ vibeCodeEnabled: isActive });
    if (isActive) {
      toggleBtn.textContent = 'Disable VibeCode';
      toggleBtn.className = 'action-btn btn-disable';
    } else {
      toggleBtn.textContent = 'Enable on this Site';
      toggleBtn.className = 'action-btn btn-enable';
    }
  }
});
