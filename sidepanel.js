// Global state
let isTyping = false;
let currentPosition = 0;
let activeInputId = null;
let textSlots = [];
let nextInputId = 1;
const TEXT_SLOTS_KEY = 'naturalTypistTexts';
const MIN_INPUT_COUNT = 3;
const SETTINGS_STORAGE_KEY = 'GhostTypeSettings';
const LEGACY_SETTINGS_STORAGE_KEY = 'HumanAutoTyperSettings';
let settings = {
  rememberText: true,
  darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
  userSetTheme: false,
  defaultSpeed: 60,
  humanMode: true,
  canvasMode: false,
  enableBreaks: true,
  minBreakTime: 1,
  maxBreakTime: 5,
  breakFrequency: 5
};

// Apply theme immediately to avoid flash
(function() {
  const saved = localStorage.getItem(SETTINGS_STORAGE_KEY) || localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
  if (saved) {
    try {
      const parsedSettings = JSON.parse(saved);
      const shouldUseDark = parsedSettings.userSetTheme 
        ? parsedSettings.darkMode 
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.classList.toggle('light-mode', !shouldUseDark);
    } catch (e) {
      // If error, use system theme
      const shouldUseDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.classList.toggle('light-mode', !shouldUseDark);
    }
  } else {
    // No saved settings, use system theme
    const shouldUseDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('light-mode', !shouldUseDark);
  }
})();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
  applyTheme();
  ensureContentScriptLoaded();
});

// Ensure content script is loaded on current tab
async function ensureContentScriptLoaded() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    
    // Skip restricted URLs
    if (!tab.url || 
        tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:')) {
      return;
    }
    
    // Try to inject content script if not already loaded
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('Content script ensured on current tab');
    } catch (err) {
      // Content script might already be loaded, or page doesn't allow injection
      console.log('Content script check:', err.message);
    }
  } catch (err) {
    console.error('Failed to ensure content script:', err);
  }
}

// Load settings from localStorage
function loadSettings() {
  const saved = localStorage.getItem(SETTINGS_STORAGE_KEY) || localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
  if (saved) {
    try {
      settings = { ...settings, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  // Apply settings to UI
  document.getElementById('typingSpeed').value = settings.defaultSpeed;
  document.getElementById('humanModeToggle').checked = settings.humanMode !== false; // default true
  document.getElementById('canvasModeToggle').checked = settings.canvasMode === true;
  updateSpeedDisplay();

  loadTextInputs();
}

function loadTextInputs() {
  let savedSlots = [];
  if (settings.rememberText) {
    try {
      const saved = JSON.parse(localStorage.getItem(TEXT_SLOTS_KEY) || 'null');
      if (Array.isArray(saved)) {
        savedSlots = saved.filter((value) => typeof value === 'string');
      } else {
        const legacyText = localStorage.getItem('naturalTypistText');
        if (legacyText) savedSlots = [legacyText];
      }
    } catch (error) {
      console.error('Failed to load saved text fields:', error);
    }
  }

  const fieldCount = Math.max(MIN_INPUT_COUNT, savedSlots.length);
  textSlots = [];
  for (let index = 0; index < fieldCount; index++) {
    const id = nextInputId++;
    textSlots.push(id);
    addInputCard(id, savedSlots[index] || '');
  }
  updateInputFieldActions();
}

function addInputCard(id, text = '') {
  const template = document.getElementById('inputCardTemplate');
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.input-card');
  const input = card.querySelector('.typing-input');
  card.dataset.inputId = String(id);
  input.value = text;
  card.querySelector('.character-count').textContent = `${text.length} chars`;
  document.getElementById('inputFields').appendChild(fragment);
}

function saveTextInputs() {
  if (!settings.rememberText) return;
  const values = [...document.querySelectorAll('.input-card .typing-input')].map((input) => input.value);
  localStorage.setItem(TEXT_SLOTS_KEY, JSON.stringify(values));
}

function updateInputFieldActions() {
  const removeButton = document.getElementById('removeInputBtn');
  const inputCount = document.querySelectorAll('#inputFields .input-card').length;
  removeButton.disabled = isTyping || inputCount <= MIN_INPUT_COUNT;
  const hasText = [...document.querySelectorAll('#inputFields .typing-input')].some((input) => input.value.length > 0);
  document.getElementById('clearAllTextsBtn').disabled = isTyping || !hasText;
}

// Apply theme
function applyTheme() {
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldUseDark = settings.userSetTheme 
    ? settings.darkMode 
    : systemPrefersDark;
  
  document.body.classList.toggle('light-mode', !shouldUseDark);
  
  console.log('Theme applied:', {
    systemPrefersDark,
    userSetTheme: settings.userSetTheme,
    darkMode: settings.darkMode,
    shouldUseDark
  });
}

// Setup event listeners
function setupEventListeners() {
  document.getElementById('inputFields').addEventListener('input', (event) => {
    if (!event.target.matches('.typing-input')) return;
    event.target.closest('.input-card').querySelector('.character-count').textContent = `${event.target.value.length} chars`;
    saveTextInputs();
    updateInputFieldActions();
  });
  document.getElementById('inputFields').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const card = button.closest('.input-card');
    if (!card) return;
    const inputId = Number(card.dataset.inputId);
    if (button.dataset.action === 'paste') pasteFromClipboard(card);
    if (button.dataset.action === 'clear') clearText(card);
    if (button.dataset.action === 'start') startTyping(inputId);
    if (button.dataset.action === 'stop') stopTyping(inputId);
  });
  document.getElementById('removeInputBtn').addEventListener('click', () => {
    if (isTyping || textSlots.length <= MIN_INPUT_COUNT) return;
    const removedId = textSlots.pop();
    getInputCard(removedId)?.remove();
    saveTextInputs();
    updateInputFieldActions();
  });
  document.getElementById('addInputBtn').addEventListener('click', () => {
    const id = nextInputId++;
    textSlots.push(id);
    addInputCard(id);
    saveTextInputs();
    updateInputFieldActions();
  });
  document.getElementById('clearAllTextsBtn').addEventListener('click', clearAllTextInputs);

  // Speed slider
  const speedSlider = document.getElementById('typingSpeed');
  speedSlider.addEventListener('input', () => {
    updateSpeedDisplay();
    settings.defaultSpeed = parseInt(speedSlider.value);
    saveSettings();
  });

  // Human mode toggle
  const humanModeToggle = document.getElementById('humanModeToggle');
  humanModeToggle.addEventListener('change', () => {
    settings.humanMode = humanModeToggle.checked;
    saveSettings();
  });

  const canvasModeToggle = document.getElementById('canvasModeToggle');
  canvasModeToggle.addEventListener('change', () => {
    settings.canvasMode = canvasModeToggle.checked;
    saveSettings();
  });

  // Listen for messages from content script and background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Sidepanel received message:', message.action, message);

    switch (message.action) {
      case 'updateProgress':
        updateProgress(message.progress, activeInputId);
        sendResponse({ status: 'done' });
        break;
      case 'typingComplete':
        onTypingComplete(activeInputId);
        sendResponse({ status: 'done' });
        break;
      case 'contextMenuStart':
        if (textSlots.length && !isTyping) {
          startTyping(textSlots[0]);
        }
        sendResponse({ status: 'done' });
        break;
      default:
        return false;
    }

    return false;
  });

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!settings.userSetTheme) {
      applyTheme();
    }
  });
}

// Save settings
function saveSettings() {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

// Update displays
function updateSpeedDisplay() {
  // WPM display removed
}

function getInputCard(inputId) {
  return document.querySelector(`.input-card[data-input-id="${inputId}"]`);
}

function updateProgress(progress, inputId) {
  const card = getInputCard(inputId);
  if (!card) return;
  card.querySelector('.progress-container').classList.add('visible');
  card.querySelector('.progress-fill').style.width = `${progress}%`;
}

// Typing controls
function startTyping(inputId) {
  if (isTyping) {
    showToast('Stop the current typing session before starting another field');
    return;
  }
  const card = getInputCard(inputId);
  const text = card?.querySelector('.typing-input').value || '';
  if (!text) {
    showToast('Please enter some text to type');
    return;
  }

  isTyping = true;
  activeInputId = inputId;
  startTypingInternal(text, inputId);
}

function startTypingInternal(text, inputId) {
  const speed = parseInt(document.getElementById('typingSpeed').value);
  // Random error rate between 3% and 7% for natural typing (will vary per character)
  const errorRate = (3 + Math.random() * 4) / 100;
  const card = getInputCard(inputId);
  card.querySelector('[data-action="start"]').disabled = true;
  card.querySelector('[data-action="stop"]').disabled = false;
  document.querySelectorAll('.input-card [data-action="start"]').forEach((button) => {
    button.disabled = true;
  });
  updateInputFieldActions();
  card.querySelector('.progress-container').classList.add('visible');
  updateProgress(0, inputId);

  // Send message to background to start typing
  chrome.runtime.sendMessage({
    action: 'startTyping',
    text: text,
    speed: speed,
    errorRate: errorRate,
    humanMode: settings.humanMode,
    canvasMode: settings.canvasMode,
    position: currentPosition
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to start typing:', chrome.runtime.lastError);
      showToast('Error: ' + chrome.runtime.lastError.message, 'error');
      stopTyping(inputId);
    } else if (response && response.status === 'error') {
      console.error('Typing error:', response.error);
      showToast(response.error || 'Failed to start typing', 'error');
      stopTyping(inputId);
    } else if (response && response.status === 'no_tab') {
      showToast('No active tab found. Please open a page first.', 'warning');
      stopTyping(inputId);
    } else {
      console.log('Typing started successfully:', response);
    }
  });
}

function stopTyping(inputId = activeInputId) {
  if (inputId === null || inputId !== activeInputId) return;
  isTyping = false;
  activeInputId = null;
  currentPosition = 0;
  const card = getInputCard(inputId);
  if (card) {
    card.querySelector('[data-action="start"]').disabled = false;
    card.querySelector('[data-action="stop"]').disabled = true;
    card.querySelector('.progress-container').classList.remove('visible');
    card.querySelector('.progress-fill').style.width = '0%';
  }
  document.querySelectorAll('.input-card [data-action="start"]').forEach((button) => {
    button.disabled = false;
  });
  updateInputFieldActions();

  chrome.runtime.sendMessage({ action: 'stopTyping' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Stop error:', chrome.runtime.lastError);
    }
  });
}

function onTypingComplete(inputId) {
  if (inputId === null || inputId !== activeInputId) return;
  const card = getInputCard(inputId);
  if (!card) return;
  isTyping = false;
  activeInputId = null;
  currentPosition = 0;
  updateProgress(100, inputId);
  card.querySelector('[data-action="start"]').disabled = false;
  card.querySelector('[data-action="stop"]').disabled = true;
  document.querySelectorAll('.input-card [data-action="start"]').forEach((button) => {
    button.disabled = false;
  });
  updateInputFieldActions();
  setTimeout(() => {
    card.querySelector('.progress-container').classList.remove('visible');
    card.querySelector('.progress-fill').style.width = '0%';
  }, 1200);
}

async function pasteFromClipboard(card) {
  try {
    // Read text from clipboard
    const text = await navigator.clipboard.readText();
    
    if (!text) {
      showToast('Clipboard is empty', 'warning');
      return;
    }
    
    // Insert text into input field
    const input = card.querySelector('.typing-input');
    input.value = text;
    card.querySelector('.character-count').textContent = `${text.length} chars`;
    saveTextInputs();
    updateInputFieldActions();

  } catch (err) {
    console.error('Failed to read clipboard:', err);
    showToast('Failed to paste: ' + err.message, 'error');
  }
}

function clearText(card) {
  const input = card.querySelector('.typing-input');
  input.value = '';
  card.querySelector('.character-count').textContent = '0 chars';
  saveTextInputs();
  updateInputFieldActions();
}

function clearAllTextInputs() {
  if (isTyping) return;
  document.querySelectorAll('#inputFields .input-card').forEach((card) => {
    card.querySelector('.typing-input').value = '';
    card.querySelector('.character-count').textContent = '0 chars';
  });
  saveTextInputs();
  updateInputFieldActions();
  showToast('All text snippets cleared', 'success');
}

function showToast(message, type = 'info', duration = 3000) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.dataset.type = type;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toast.textContent = message;
  toast.classList.add('toast-enter');

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}
