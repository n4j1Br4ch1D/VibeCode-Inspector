function toggleInspector(tab) {
  chrome.tabs.sendMessage(tab.id, { action: "toggleInspector" }).then((response) => {
    updateIcon(tab.id, response && response.isActive);
  }).catch(() => {
    // Inject scripts if not already injected (fallback)
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { action: "toggleInspector" }).then((res) => {
        updateIcon(tab.id, res && res.isActive);
      }).catch(() => {});
    }, 100);
  });
}

function updateIcon(tabId, isActive) {
  const suffix = isActive ? '.png' : '_gray.png';
  chrome.action.setIcon({
    tabId: tabId,
    path: {
      "16": `icons/icon16${suffix}`,
      "32": `icons/icon32${suffix}`,
      "48": `icons/icon48${suffix}`,
      "128": `icons/icon128${suffix}`
    }
  }).catch(() => {});
}

// When a tab is updated or activated, ask the content script if it's active
function checkTabState(tabId) {
  chrome.tabs.sendMessage(tabId, { action: "getStatus" }).then((response) => {
    updateIcon(tabId, response && response.isActive);
  }).catch(() => {
    updateIcon(tabId, false);
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    checkTabState(tabId);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  checkTabState(activeInfo.tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "iconStateChanged" && sender.tab) {
    updateIcon(sender.tab.id, message.isActive);
  } else if (message.action === "captureTab") {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl: dataUrl });
    });
    return true; // Keep channel open for async response
  } else if (message.action === "sendToIDE") {
    const { payload } = message;
    const targetUrl = 'http://127.0.0.1:31337/send-prompt';

    fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => {
        console.error('Bridge Error:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  } else if (message.action === "runCli") {
    const cliCommand = message.command || 'pbcopy';
    // Use the same bridge for CLI if it supports it, or just sendResponse false
    sendResponse({ success: false, error: "CLI Bridge not detected on port 31337" });
    return true;
  }
});

chrome.action.onClicked.addListener((tab) => toggleInspector(tab));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "toggle-vibecode",
    title: "Toggle VibeCode Inspector",
    contexts: ["all"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "toggle-vibecode") {
    toggleInspector(tab);
  }
});
