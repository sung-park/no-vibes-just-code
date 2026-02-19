// options/options.js — No Vibes Just Code
// Depends on: ../shared/constants.js, ../shared/storage.js
'use strict';

(async function () {

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const apiUrlInput        = document.getElementById('apiUrlInput');
  const modelInput         = document.getElementById('modelInput');
  const minLengthInput     = document.getElementById('minLengthInput');
  const minLengthValue     = document.getElementById('minLengthValue');
  const blockThresholdInput= document.getElementById('blockThresholdInput');
  const blockThresholdValue= document.getElementById('blockThresholdValue');
  const preThresholdInput  = document.getElementById('preThresholdInput');
  const preThresholdValue  = document.getElementById('preThresholdValue');
  const w1Input            = document.getElementById('w1Input');
  const w2Input            = document.getElementById('w2Input');
  const w3Input            = document.getElementById('w3Input');
  const w4Input            = document.getElementById('w4Input');
  const w1Value            = document.getElementById('w1Value');
  const w2Value            = document.getElementById('w2Value');
  const w3Value            = document.getElementById('w3Value');
  const w4Value            = document.getElementById('w4Value');
  const weightSumBadge     = document.getElementById('weightSumBadge');
  const excludedSitesInput = document.getElementById('excludedSitesInput');
  const addSiteBtn         = document.getElementById('addSiteBtn');
  const excludedSitesList  = document.getElementById('excludedSitesList');
  const exportBtn          = document.getElementById('exportBtn');
  const importFile         = document.getElementById('importFile');
  const resetBtn           = document.getElementById('resetBtn');
  const saveToast          = document.getElementById('saveToast');

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  let toastTimer = null;
  function showSaved() {
    saveToast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => saveToast.classList.remove('visible'), 1500);
  }

  function roundWeight(val) {
    return Math.round(parseFloat(val) * 100) / 100;
  }

  // ── Weight validation ─────────────────────────────────────────────────────────

  function readWeights() {
    return {
      w1: roundWeight(w1Input.value),
      w2: roundWeight(w2Input.value),
      w3: roundWeight(w3Input.value),
      w4: roundWeight(w4Input.value),
    };
  }

  function updateWeightSum() {
    const w = readWeights();
    const sum = roundWeight(w.w1 + w.w2 + w.w3 + w.w4);
    const ok  = Math.abs(sum - 1.0) < 0.01;
    weightSumBadge.textContent = `합계: ${sum.toFixed(2)}`;
    weightSumBadge.className   = 'weight-sum-badge' + (ok ? '' : ' invalid');
    return ok;
  }

  function updateWeightDisplays() {
    w1Value.textContent = roundWeight(w1Input.value).toFixed(2);
    w2Value.textContent = roundWeight(w2Input.value).toFixed(2);
    w3Value.textContent = roundWeight(w3Input.value).toFixed(2);
    w4Value.textContent = roundWeight(w4Input.value).toFixed(2);
  }

  // ── Excluded Sites ────────────────────────────────────────────────────────────

  let excludedSites = [];

  function renderSiteTags() {
    excludedSitesList.innerHTML = '';
    excludedSites.forEach((site) => {
      const tag = document.createElement('span');
      tag.className   = 'site-tag';
      tag.textContent = site;
      const del = document.createElement('button');
      del.className   = 'site-tag-del';
      del.type        = 'button';
      del.textContent = '×';
      del.title       = `${site} 제거`;
      del.addEventListener('click', () => {
        excludedSites = excludedSites.filter((s) => s !== site);
        renderSiteTags();
        saveSites();
      });
      tag.appendChild(del);
      excludedSitesList.appendChild(tag);
    });
  }

  function saveSites() {
    NVJC_STORAGE.saveSettings({ [NVJC.STORAGE_KEYS.EXCLUDED_SITES]: excludedSites })
      .then(showSaved);
  }

  function addSite() {
    const val = excludedSitesInput.value.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!val || excludedSites.includes(val)) return;
    excludedSites.push(val);
    renderSiteTags();
    saveSites();
    excludedSitesInput.value = '';
  }

  // ── Populate UI from settings ─────────────────────────────────────────────────

  async function loadUI() {
    const s = await NVJC_STORAGE.getAllSettings();

    apiUrlInput.value = s.apiUrl;
    modelInput.value  = s.model;

    minLengthInput.value     = s.minLength;
    minLengthValue.textContent = s.minLength;

    blockThresholdInput.value  = s.blockThreshold;
    blockThresholdValue.textContent = s.blockThreshold;

    preThresholdInput.value  = s.preThreshold;
    preThresholdValue.textContent = s.preThreshold;

    const w = s.weights;
    w1Input.value = w.w1; w1Value.textContent = w.w1.toFixed(2);
    w2Input.value = w.w2; w2Value.textContent = w.w2.toFixed(2);
    w3Input.value = w.w3; w3Value.textContent = w.w3.toFixed(2);
    w4Input.value = w.w4; w4Value.textContent = w.w4.toFixed(2);
    updateWeightSum();

    excludedSites = [...(s.excludedSites || [])];
    renderSiteTags();
  }

  // ── Save helpers ──────────────────────────────────────────────────────────────

  const saveText = debounce((key, val) => {
    if (val) NVJC_STORAGE.saveSettings({ [key]: val }).then(showSaved);
  }, 600);

  function saveNumber(key, val) {
    NVJC_STORAGE.saveSettings({ [key]: Number(val) }).then(showSaved);
  }

  function saveWeights() {
    if (!updateWeightSum()) return; // don't save if sum ≠ 1
    NVJC_STORAGE.saveSettings({ [NVJC.STORAGE_KEYS.WEIGHTS]: readWeights() }).then(showSaved);
  }

  // ── Event listeners ───────────────────────────────────────────────────────────

  apiUrlInput.addEventListener('input', (e) => saveText(NVJC.STORAGE_KEYS.API_URL, e.target.value.trim()));
  modelInput.addEventListener('input',  (e) => saveText(NVJC.STORAGE_KEYS.MODEL,   e.target.value.trim()));

  minLengthInput.addEventListener('input', (e) => {
    minLengthValue.textContent = e.target.value;
    saveNumber(NVJC.STORAGE_KEYS.MIN_LENGTH, e.target.value);
  });

  blockThresholdInput.addEventListener('input', (e) => {
    blockThresholdValue.textContent = e.target.value;
    saveNumber(NVJC.STORAGE_KEYS.BLOCK_THRESHOLD, e.target.value);
  });

  preThresholdInput.addEventListener('input', (e) => {
    preThresholdValue.textContent = e.target.value;
    saveNumber(NVJC.STORAGE_KEYS.PRE_THRESHOLD, e.target.value);
  });

  [w1Input, w2Input, w3Input, w4Input].forEach((input) => {
    input.addEventListener('input', () => {
      updateWeightDisplays();
      saveWeights();
    });
  });

  addSiteBtn.addEventListener('click', addSite);
  excludedSitesInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSite();
  });

  // ── Export ────────────────────────────────────────────────────────────────────
  exportBtn.addEventListener('click', async () => {
    const s = await NVJC_STORAGE.getAllSettings();
    const json = JSON.stringify(s, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'nvjc-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Import ────────────────────────────────────────────────────────────────────
  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const k = NVJC.STORAGE_KEYS;
        const d = NVJC.DEFAULTS;
        // Validate and whitelist keys before saving
        const safe = {};
        if (typeof parsed.apiUrl         === 'string')  safe[k.API_URL]         = parsed.apiUrl;
        if (typeof parsed.model          === 'string')  safe[k.MODEL]           = parsed.model;
        if (typeof parsed.blockThreshold === 'number')  safe[k.BLOCK_THRESHOLD] = parsed.blockThreshold;
        if (typeof parsed.preThreshold   === 'number')  safe[k.PRE_THRESHOLD]   = parsed.preThreshold;
        if (typeof parsed.minLength      === 'number')  safe[k.MIN_LENGTH]      = parsed.minLength;
        if (typeof parsed.debounceMs     === 'number')  safe[k.DEBOUNCE_MS]     = parsed.debounceMs;
        if (Array.isArray(parsed.excludedSites))        safe[k.EXCLUDED_SITES]  = parsed.excludedSites;
        if (parsed.weights && typeof parsed.weights === 'object') safe[k.WEIGHTS] = parsed.weights;
        await NVJC_STORAGE.saveSettings(safe);
        await loadUI();
        showSaved();
      } catch {
        alert('올바른 JSON 파일이 아닙니다.');
      }
      importFile.value = '';
    };
    reader.readAsText(file);
  });

  // ── Reset ─────────────────────────────────────────────────────────────────────
  resetBtn.addEventListener('click', async () => {
    if (!confirm('모든 설정을 기본값으로 초기화할까요?')) return;
    await NVJC_STORAGE.resetToDefaults();
    await loadUI();
    showSaved();
  });

  // ── Init ──────────────────────────────────────────────────────────────────────
  await loadUI();

}());
