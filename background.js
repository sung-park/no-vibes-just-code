// background.js — No Vibes Just Code
// Manifest V3 Service Worker.
// Responsibilities:
//   - Phase 2: Call Ollama API to get semantic F and T scores
//   - Track per-tab AHI stats in chrome.storage.session
//   - Respond to ping, settings queries from popup
'use strict';

// ── Inline constants (Service Worker cannot import content script shared files) ──

const SK = {
  ENABLED:         'nvjc_enabled',
  API_URL:         'nvjc_api_url',
  MODEL:           'nvjc_model',
  BLOCK_THRESHOLD: 'nvjc_block_threshold',
  PRE_THRESHOLD:   'nvjc_pre_threshold',
  MIN_LENGTH:      'nvjc_min_length',
  DEBOUNCE_MS:     'nvjc_debounce_ms',
  EXCLUDED_SITES:  'nvjc_excluded_sites',
  WEIGHTS:         'nvjc_weights',
};

const DFLT = {
  API_URL: 'http://localhost:11434',
  MODEL:   'qwen2.5:3b',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOllamaConfig() {
  const items = await chrome.storage.sync.get([SK.API_URL, SK.MODEL]);
  return {
    apiUrl: items[SK.API_URL] ?? DFLT.API_URL,
    model:  items[SK.MODEL]   ?? DFLT.MODEL,
  };
}

function buildPrompt(text) {
  // Truncate to avoid excessive token usage
  const truncated = text.slice(0, 600);
  return `You are an AI content analyst. Score the following text on exactly two dimensions.
Respond ONLY with a valid JSON object — no markdown, no explanation outside JSON.

Dimension definitions:
- F (Fear/FOMO, 0.0–1.0): Degree of fear, urgency, or social pressure used to manipulate the reader.
  High F signals: "당신만 모른다", "도태된다", "지금 당장 안하면", "마지막 기회", "살아남으려면"
  Low F signals: neutral, informative, no time pressure.
- T (Technical specificity, 0.0–1.0): How grounded and verifiable the content is.
  High T (1.0): code snippets, cited benchmarks, specific API names, reproducible experiments.
  Low T (0.0): vague adjectives, unverified "10배 수익", no sources, no technical details.

Text to analyze:
"""
${truncated}
"""

Respond with exactly this JSON (fill in real values):
{"F": 0.0, "T": 0.0, "reason": "판별 근거를 한 문장으로"}`;
}

// ── Ollama Request Queue (per-tab, serialized) ────────────────────────────────
// Each tab gets its own queue so a page refresh doesn't wait for the old page's
// in-flight requests. Queues are cleared when the tab starts navigating.

const _tabQueues = new Map(); // tabId → Promise (the current tail of the chain)

function enqueueOllama(text, tabId) {
  const current = _tabQueues.get(tabId) || Promise.resolve();
  const p = current.then(
    () => callOllamaAPI(text),
    () => callOllamaAPI(text),  // keep chain alive even if previous call failed
  );
  // Store a never-rejecting tail so the next enqueue can chain onto it safely
  _tabQueues.set(tabId, p.then(() => {}, () => {}));
  return p;
}

// Clear a tab's queue when it starts loading a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    _tabQueues.delete(tabId);
  }
});

// ── Ollama API Call ────────────────────────────────────────────────────────────

async function callOllamaAPI(text) {
  const { apiUrl, model } = await getOllamaConfig();

  let response;
  try {
    response = await fetch(`${apiUrl}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt:  buildPrompt(text),
        stream:  false,
        format:  'json',
        options: { temperature: 0.1, num_predict: 120 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return safeDefault(err.name === 'AbortError' ? 'TIMEOUT' : 'OLLAMA_UNREACHABLE');
  }

  if (!response.ok) {
    return safeDefault(`HTTP_${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return safeDefault('RESPONSE_PARSE_ERROR');
  }

  // Ollama wraps the model's JSON string in data.response
  let parsed;
  try {
    parsed = JSON.parse(data.response);
  } catch {
    // Attempt to extract JSON from the string if model added extra text
    const match = (data.response || '').match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { return safeDefault('JSON_PARSE_ERROR'); }
    } else {
      return safeDefault('JSON_PARSE_ERROR');
    }
  }

  return {
    F:          clamp(Number(parsed.F)  || 0,   0, 1),
    T_semantic: clamp(Number(parsed.T)  || 0.5, 0, 1),
    reason:     String(parsed.reason || ''),
  };
}

/** Safe default: do NOT over-block when Ollama fails. */
function safeDefault(errorCode) {
  return { F: 0, T_semantic: 1, error: errorCode };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ── Ollama Health Check ────────────────────────────────────────────────────────

async function pingOllama() {
  const { apiUrl } = await getOllamaConfig();
  try {
    const res = await fetch(`${apiUrl}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

// ── Session Stats ─────────────────────────────────────────────────────────────

function statsKey(tabId) {
  return `nvjc_stats_${tabId}`;
}

async function updateTabStats(tabId, ahi) {
  const key   = statsKey(tabId);
  const items = await chrome.storage.session.get(key);
  const cur   = items[key] || { count: 0, totalAHI: 0 };
  const count = cur.count + 1;
  const total = cur.totalAHI + ahi;
  await chrome.storage.session.set({
    [key]: { count, totalAHI: total, avgAHI: Math.round(total / count) },
  });
}

async function getTabStats(tabId) {
  const key   = statsKey(tabId);
  const items = await chrome.storage.session.get(key);
  const data  = items[key];
  return data ? { count: data.count, avgAHI: data.avgAHI } : { count: 0, avgAHI: 0 };
}

// ── Message Router ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  if (action === 'ANALYZE_TEXT') {
    const tabId = sender.tab && sender.tab.id;
    enqueueOllama(message.text, tabId).then(sendResponse);
    return true; // keep channel open for async response
  }

  if (action === 'UPDATE_STATS') {
    const tabId = (sender.tab && sender.tab.id != null)
      ? sender.tab.id
      : message.tabId;
    if (tabId != null) {
      updateTabStats(tabId, message.ahi)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    sendResponse({ ok: false });
    return false;
  }

  if (action === 'GET_TAB_STATS') {
    getTabStats(message.tabId).then(sendResponse);
    return true;
  }

  if (action === 'PING_OLLAMA') {
    pingOllama().then(sendResponse);
    return true;
  }

  if (action === 'GET_SETTINGS') {
    chrome.storage.sync.get(null, sendResponse);
    return true;
  }
});

// ── Cleanup: remove session stats when tab closes ─────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(statsKey(tabId));
  _tabQueues.delete(tabId);
});
