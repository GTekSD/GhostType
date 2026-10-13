browser.action.onClicked.addListener(() => {
  browser.sidebarAction.open().catch((error) => {
    console.error('Failed to open GhostType sidebar:', error);
  });
});

browser.runtime.onInstalled.addListener(async () => {
  browser.contextMenus.create({
    id: 'startTyping',
    title: 'Start typing with GhostType',
    contexts: ['editable']
  });

  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (
      !tab.id ||
      !tab.url ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('moz-extension:')
    ) {
      continue;
    }

    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (error) {
      console.info(`Could not inject into tab ${tab.id}:`, error.message);
    }
  }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'startTyping' || !tab?.windowId) return;

  try {
    await browser.sidebarAction.open();
  } catch (error) {
    console.error('Failed to open GhostType sidebar:', error);
    return;
  }

  setTimeout(() => {
    browser.runtime.sendMessage({ action: 'contextMenuStart' }).catch((error) => {
      console.info('GhostType sidebar is not ready yet:', error.message);
    });
  }, 500);
});

async function sendMessageToTabWithInjection(tabId, message) {
  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!error.message.includes('Receiving end does not exist')) {
      throw error;
    }
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (error) {
    throw new Error(`Could not load GhostType on this page. Reload the page and try again. ${error.message}`);
  }

  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    throw new Error(`GhostType could not connect to this page after loading its content script. ${error.message}`);
  }
}

browser.runtime.onMessage.addListener(async (message) => {
  if (!['startTyping', 'pauseTyping', 'stopTyping'].includes(message.action)) {
    return undefined;
  }

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { status: 'no_tab' };

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

  try {
    const response = await sendMessageToTabWithInjection(tab.id, payload);
    return response || { status: message.action === 'startTyping' ? 'sent' : 'done' };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
});
