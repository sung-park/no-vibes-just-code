// popup/popup.js — No Vibes Just Code
// Depends on: ../shared/constants.js, ../shared/storage.js
'use strict';

(async function () {

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const enabledToggle = document.getElementById('enabledToggle');
  const apiUrlInput   = document.getElementById('apiUrlInput');
  const modelInput    = document.getElementById('modelInput');
  const blockedCountEl= document.getElementById('blockedCount');
  const avgAHIEl      = document.getElementById('avgAHI');
  const statusDot     = document.getElementById('statusDot');
  const statusText    = document.getElementById('statusText');
  const optionsBtn    = document.getElementById('optionsBtn');

  // ── Load settings ─────────────────────────────────────────────────────────────
  const s = await NVJC_STORAGE.getAllSettings();
  enabledToggle.checked = s.enabled;
  apiUrlInput.value     = s.apiUrl;
  modelInput.value      = s.model;

  // ── Load per-tab stats ────────────────────────────────────────────────────────
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    const stats = await chrome.runtime.sendMessage({
      action: NVJC.ACTIONS.GET_TAB_STATS,
      tabId: tab.id,
    });
    if (stats && stats.count > 0) {
      blockedCountEl.textContent = `${stats.count}개`;
      avgAHIEl.textContent       = String(stats.avgAHI);
    } else {
      blockedCountEl.textContent = '0개';
      avgAHIEl.textContent       = '—';
    }
  }

  // ── Ping Ollama (non-blocking) ────────────────────────────────────────────────
  chrome.runtime.sendMessage({ action: NVJC.ACTIONS.PING_OLLAMA }).then((result) => {
    if (result && result.ok) {
      statusDot.className    = 'status-dot connected';
      statusText.textContent = '연결됨';
    } else {
      statusDot.className    = 'status-dot disconnected';
      statusText.textContent = '연결 안 됨 — Ollama 실행 확인';
    }
  }).catch(() => {
    statusDot.className    = 'status-dot disconnected';
    statusText.textContent = '연결 안 됨';
  });

  // ── Debounced input save ──────────────────────────────────────────────────────
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  const saveApiUrl = debounce((val) => {
    if (val) NVJC_STORAGE.saveSettings({ [NVJC.STORAGE_KEYS.API_URL]: val });
  }, 600);

  const saveModel = debounce((val) => {
    if (val) NVJC_STORAGE.saveSettings({ [NVJC.STORAGE_KEYS.MODEL]: val });
  }, 600);

  // ── Event listeners ───────────────────────────────────────────────────────────
  enabledToggle.addEventListener('change', () => {
    NVJC_STORAGE.saveSettings({ [NVJC.STORAGE_KEYS.ENABLED]: enabledToggle.checked });
  });

  apiUrlInput.addEventListener('input', (e) => saveApiUrl(e.target.value.trim()));
  modelInput.addEventListener('input',  (e) => saveModel(e.target.value.trim()));

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

}());
