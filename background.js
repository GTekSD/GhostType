chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  console.error('Failed to set panel behavior:', error);
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: 'startTyping',
    title: '▶ Start typing',
    contexts: ['editable']
  });

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (
      !tab.id ||
      !tab.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:')
    ) {
      continue;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (error) {
      console.log(`Could not inject into tab ${tab.id}:`, error.message);
    }
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'startTyping') return;

  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    console.error('Failed to open side panel:', error);
    return;
  }

  setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'contextMenuStart' }, () => {
      if (chrome.runtime.lastError) {
        console.log('Side panel not ready yet:', chrome.runtime.lastError.message);
      }
    });
  }, 500);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!['startTyping', 'pauseTyping', 'stopTyping'].includes(message.action)) {
    return false;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) {
      sendResponse({ status: 'no_tab' });
      return;
    }

    const payload = message.action === 'startTyping'
      ? {
          action: message.action,
          text: message.text,
          speed: message.speed,
          errorRate: message.errorRate,
          humanMode: message.humanMode,
          position: message.position
        }
      : { action: message.action };

    chrome.tabs.sendMessage(tab.id, payload, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse(response || { status: message.action === 'startTyping' ? 'sent' : 'done' });
    });
  });
  return true;
});
