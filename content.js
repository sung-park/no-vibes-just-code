// content.js — No Vibes Just Code
// Orchestrates 2-Phase AHI pipeline: rule-based pre-scoring → Ollama → overlay.
// Depends on: shared/constants.js, shared/storage.js, shared/ahi-scorer.js

(function () {
  'use strict';

  // Guard against double-injection (SPA navigations, iframes, etc.)
  if (window.__nvjcInitialized) return;
  window.__nvjcInitialized = true;

  // ── Config ──────────────────────────────────────────────────────────────────

  // Text containers to scan. Listed from most-specific to least.
  const TEXT_SELECTORS = [
    'article',
    '[role="article"]',
    // Twitter / X
    '[data-testid="tweetText"]',
    '[data-testid="tweet"]',
    // Threads (Meta) — posts use article or role=article; text lives in specific spans
    '[data-pressable-container]',
    'div[class*="x193iq5w"]',         // Threads post text class pattern
    // LinkedIn
    '.feed-shared-update-v2__description',
    '.feed-shared-text',
    // Facebook
    '[data-ad-preview="message"]',
    'div[data-testid="post_message"]',
    // Instagram
    'h1._aacl',
    // Blogs / news
    '.entry-content',
    '.post-content',
    '.article-content',
    '.article-body',
    '.story-body',
    // Comments
    '.comment-body',
    '.comment-content',
    // Reddit
    '.usertext-body',
    '.comment',
    // Generic fallback
    '.post-text',
  ].join(', ');

  // Minimum characters a text node must have before AHI scoring is attempted.
  // Overridden by settings.minLength after init.
  const FALLBACK_MIN_LENGTH = 100;

  let settings = null;

  // ── Utilities ────────────────────────────────────────────────────────────────

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function getAHIBorderColor(ahi) {
    if (ahi >= 91) return '#991b1b';
    if (ahi >= 76) return '#ef4444';
    return '#f59e0b';
  }

  // ── Overlay DOM builder ──────────────────────────────────────────────────────

  function buildOverlay(ahi, breakdown, reason) {
    const accent = getAHIBorderColor(ahi);

    const dims = [
      { label: '언어 과장', value: breakdown.L },
      { label: '공포 조장', value: breakdown.F },
      { label: '기술 결여', value: 100 - breakdown.T },
      { label: '상업 의도', value: breakdown.C },
    ];

    const barsHtml = dims.map((d) => `
      <div class="nvjc-bar-row">
        <span class="nvjc-bar-label">${d.label}</span>
        <div class="nvjc-bar-track">
          <div class="nvjc-bar-fill" style="width:${d.value}%"></div>
        </div>
        <span class="nvjc-bar-value">${d.value}</span>
      </div>`).join('');

    const reasonHtml = reason
      ? `<p class="nvjc-reason">&ldquo;${reason}&rdquo;</p>`
      : '';

    const overlay = document.createElement('div');
    overlay.className = 'nvjc-overlay';
    overlay.style.setProperty('--nvjc-accent', accent);
    overlay.innerHTML = `
      <div class="nvjc-overlay-header">
        <span class="nvjc-overlay-icon">⚠</span>
        <div class="nvjc-overlay-title-block">
          <span class="nvjc-overlay-title">AI 호들갑 지수 (AHI)</span>
          <span class="nvjc-overlay-badge" style="background:${accent}">${ahi} / 100</span>
        </div>
      </div>
      <div class="nvjc-bars">${barsHtml}</div>
      ${reasonHtml}
      <button class="nvjc-reveal-btn" type="button">원문 보기</button>
    `;
    return overlay;
  }

  // ── Scan Badge (non-blocked elements) ───────────────────────────────────────

  function renderBadge(badge, ahi, ollamaUsed, pre, ollamaAttempted) {
    // 세 가지 상태:
    //   🔍 = Ollama 호출 성공
    //   ⚡ = Ollama 호출 시도했지만 실패 (CORS/연결 오류)
    //   ·  = pre 낮아서 Ollama 스킵 (기술 문서 등) / 대기 중
    let icon, titleDetail;
    if (ollamaUsed) {
      icon        = '🔍';
      titleDetail = `LLM 분석 완료`;
    } else if (ollamaAttempted) {
      icon        = '⚡';
      titleDetail = `LLM 호출 실패 (Ollama 연결 확인 필요)`;
    } else {
      icon        = '·';
      titleDetail = `기술 문서로 판단, LLM 스킵`;
    }

    badge.className = 'nvjc-scan-badge';
    badge.classList.add(ahi >= 50 ? 'nvjc-badge-warn' : 'nvjc-badge-ok');
    badge.textContent = `${icon} AHI ${ahi}`;
    badge.title = `No Vibes Just Code — ${titleDetail}\nAHI ${ahi}/100  |  pre-score: ${Math.round(pre)}`;
  }

  // applyScannedBadge: 배지를 element에 추가하고 참조를 반환 (나중에 업데이트용)
  function applyScannedBadge(element, ahi, ollamaUsed, pre, ollamaAttempted) {
    const badge = document.createElement('span');
    renderBadge(badge, ahi, ollamaUsed, pre, ollamaAttempted);
    element.appendChild(badge);
    return badge; // 반환: Ollama 결과 수신 후 업데이트에 사용
  }

  // ── Apply / Remove Overlay ──────────────────────────────────────────────────

  function applyOverlay(element, ahi, breakdown, reason) {
    // Wrap: [overlay | original(hidden)] inside a block-level container
    const wrapper = document.createElement('div');
    wrapper.className = 'nvjc-wrapper';

    const overlay = buildOverlay(ahi, breakdown, reason);

    // Insert wrapper before the element, move element into wrapper
    element.parentNode.insertBefore(wrapper, element);
    wrapper.appendChild(overlay);
    wrapper.appendChild(element);
    element.classList.add('nvjc-hidden');

    // Toggle reveal
    const btn = overlay.querySelector('.nvjc-reveal-btn');
    btn.addEventListener('click', () => {
      const hidden = element.classList.toggle('nvjc-hidden');
      btn.textContent     = hidden ? '원문 보기' : '다시 숨기기';
      overlay.classList.toggle('nvjc-faded', !hidden);
    });

    // Report to background (tab id inferred from sender in background.js)
    chrome.runtime.sendMessage({ action: NVJC.ACTIONS.UPDATE_STATS, ahi });
  }

  function removeAllOverlays() {
    // Unobserve queued (not-yet-visible) elements and reset their state
    if (_viewportObserver) {
      document.querySelectorAll('[data-nvjc-processed="queued"]').forEach((el) => {
        _viewportObserver.unobserve(el);
        delete el.dataset.nvjcProcessed;
      });
    }
    document.querySelectorAll('.nvjc-wrapper').forEach((wrapper) => {
      const original = wrapper.querySelector('[data-nvjc-processed]');
      if (original) {
        original.classList.remove('nvjc-hidden');
        original.removeAttribute('data-nvjc-processed');
        original.removeAttribute('data-nvjc-ahi');
        wrapper.parentNode.insertBefore(original, wrapper);
      }
      wrapper.remove();
    });
  }

  // ── Core Processing ──────────────────────────────────────────────────────────

  async function processNode(element) {
    const text = (element.innerText || element.textContent || '').trim();
    const minLen = settings ? settings.minLength : FALLBACK_MIN_LENGTH;

    if (text.length < minLen) {
      element.dataset.nvjcProcessed = 'skip';
      return;
    }

    element.dataset.nvjcProcessed = 'pending';

    // ── Phase 1: Rule-based scoring (synchronous, <1ms) ──
    const phase1  = NVJC_SCORER.scoreRuleBased(text, element);
    const weights = settings ? settings.weights : NVJC.DEFAULTS.WEIGHTS;
    const blockThreshold = settings ? settings.blockThreshold : NVJC.DEFAULTS.BLOCK_THRESHOLD;
    const preThreshold   = settings ? settings.preThreshold  : NVJC.DEFAULTS.PRE_THRESHOLD;

    // Phase 1 result with safe Ollama defaults (F=0, T_semantic=1 = 비호들갑 방향)
    const phase2Default = { F: 0, T_semantic: 1, reason: '' };
    const { ahi: ahiP1 } = NVJC_SCORER.aggregateAHI(phase1, phase2Default, weights);

    element.dataset.nvjcProcessed = 'done';
    element.dataset.nvjcAhi       = String(ahiP1);

    // ── 즉시 Phase 1 배지 표시 (Ollama 대기 없이 바로 나타남) ──
    // Phase 1만으로는 F=0이라 거의 차단 안 됨 → 항상 배지 먼저 표시
    const badge = applyScannedBadge(element, ahiP1, false, phase1.pre, false);

    // ── Phase 2 gate: Ollama 호출 ──
    if (phase1.pre < preThreshold) return; // 기술 문서 등, Ollama 스킵

    let phase2 = phase2Default;
    let ollamaUsed = false;
    try {
      const result = await chrome.runtime.sendMessage({
        action: NVJC.ACTIONS.ANALYZE_TEXT,
        text,
      });
      if (result && !result.error) {
        phase2     = result;
        ollamaUsed = true;
      }
    } catch (_err) {
      // Extension context invalidated or Ollama unreachable
    }

    // ── Ollama 결과로 AHI 재계산 후 배지 업데이트 ──
    const { ahi, breakdown } = NVJC_SCORER.aggregateAHI(phase1, phase2, weights);
    element.dataset.nvjcAhi = String(ahi);

    if (ahi >= blockThreshold) {
      // 배지 제거 후 오버레이로 업그레이드
      badge.remove();
      applyOverlay(element, ahi, breakdown, phase2.reason || '');
    } else {
      // 배지를 최종 AHI + Ollama 상태로 업데이트
      renderBadge(badge, ahi, ollamaUsed, phase1.pre, /* ollamaAttempted */ true);
    }
  }

  // ── Viewport-priority Scanner (IntersectionObserver) ─────────────────────────
  // Elements are only processed when they enter (or are near) the viewport.
  // This ensures visible content is analyzed first and off-screen content
  // is deferred until the user scrolls to it — minimizing wasted Ollama calls.

  let _viewportObserver = null;

  function observeElement(el) {
    if (el.dataset.nvjcProcessed) return;
    el.dataset.nvjcProcessed = 'queued'; // mark so MutationObserver won't re-add
    _viewportObserver.observe(el);
  }

  function startViewportObserver() {
    _viewportObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        _viewportObserver.unobserve(el); // process each element once
        if (el.dataset.nvjcProcessed === 'queued') {
          processNode(el);
        }
      });
    }, {
      // Start processing 200px before entering the viewport for a smooth UX
      rootMargin: '200px 0px',
    });
  }

  function scanPage() {
    if (!settings || !settings.enabled) return;

    const candidates = document.querySelectorAll(TEXT_SELECTORS);
    candidates.forEach((el) => {
      if (!el.dataset.nvjcProcessed) {
        observeElement(el);
      }
    });
  }

  // ── MutationObserver (SPA support) ───────────────────────────────────────────

  function startObserver(debounceMs) {
    const debouncedScan = debounce(scanPage, debounceMs);
    const observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some((m) => m.addedNodes.length > 0);
      if (hasNewNodes) debouncedScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  // ── Settings Change Listener ─────────────────────────────────────────────────

  function listenForSettingsChanges() {
    chrome.storage.onChanged.addListener((changes) => {
      // Re-read all settings on any change
      NVJC_STORAGE.getAllSettings().then((s) => {
        settings = s;

        // Handle enable/disable toggle
        if (changes[NVJC.STORAGE_KEYS.ENABLED]) {
          if (!s.enabled) {
            removeAllOverlays();
          } else {
            // Re-scan with fresh settings
            document.querySelectorAll('[data-nvjc-processed]').forEach((el) => {
              delete el.dataset.nvjcProcessed;
              delete el.dataset.nvjcAhi;
            });
            scanPage();
          }
        }
      });
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  async function init() {
    settings = await NVJC_STORAGE.getAllSettings();

    if (!settings.enabled) return;

    // Skip excluded sites
    const hostname = window.location.hostname;
    const isExcluded = settings.excludedSites.some((site) => hostname.includes(site));
    if (isExcluded) return;

    startViewportObserver();
    scanPage();
    startObserver(settings.debounceMs);
    listenForSettingsChanges();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
