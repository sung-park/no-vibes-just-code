// shared/ahi-scorer.js — No Vibes Just Code
// Phase 1: Rule-based AHI scoring. Runs synchronously without any API calls.
// Depends on: shared/constants.js (NVJC must be defined)

/* global var */ var NVJC_SCORER = (function () {
  'use strict';

  // ── Utilities ──────────────────────────────────────────────────────────────

  function wordCount(text) {
    var words = text.split(/\s+/).filter(function (w) { return w.length > 0; });
    return Math.max(words.length, 1);
  }

  /** Count total occurrences of all keywords in text (case-insensitive). */
  function countKeywordMatches(text, keywords) {
    var lower = text.toLowerCase();
    var total = 0;
    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i].toLowerCase();
      var idx = 0;
      while ((idx = lower.indexOf(kw, idx)) !== -1) {
        total++;
        idx += kw.length;
      }
    }
    return total;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // ── L: Linguistic Inflation (0–1) ──────────────────────────────────────────
  //   Measures superlative density, emoji overuse, and punctuation inflation.

  function scoreL(text) {
    var wc = wordCount(text);
    var allHypeKw = NVJC.HYPE_KEYWORDS.ko.concat(NVJC.HYPE_KEYWORDS.en);

    // 1. Hype keyword density (per 100 words)
    var hypeCount   = countKeywordMatches(text, allHypeKw);
    var keywordRate = hypeCount / wc * 100;
    var keywordScore = clamp(keywordRate / 8, 0, 1);   // saturates at 8 hype words per 100

    // 2. Emoji density — hype emojis: 🔥🚀🤯💰💥⚡🎯🏆 + 😱😂🤑
    var hypeEmojiPattern = /[\u{1F525}\u{1F680}\u{1F92F}\u{1F4B0}\u{1F4A5}\u{26A1}\u{1F3AF}\u{1F3C6}\u{1F4AF}\u{1F631}\u{1F602}\u{1F911}]/gu;
    var emojiCount = (text.match(hypeEmojiPattern) || []).length;
    var emojiScore = clamp(emojiCount / wc * 50, 0, 1);

    // 3. Consecutive exclamations / questions (!! or !? etc.)
    var multiPunct = (text.match(/[!！?？]{2,}/g) || []).length;
    var punctScore = clamp(multiPunct / (wc / 20), 0, 1);

    // 4. Unverified large monetary claims in Korean (출처 없는 큰 금액)
    //    예: "100억", "연매출 100억", "월 1000만원", "10억 달성"
    var monetaryMatches = text.match(/\d+\s*(억|천만|백만\s*원|만\s*달러)/g) || [];
    var monetaryScore = clamp(monetaryMatches.length * 0.35, 0, 1);

    return clamp(
      keywordScore  * 0.45
      + emojiScore  * 0.20
      + punctScore  * 0.10
      + monetaryScore * 0.25,
      0, 1
    );
  }

  // ── C: Commercial Intent (0–1) ─────────────────────────────────────────────
  //   Measures CTA keyword frequency and marketing link ratio in DOM.

  function scoreC(text, element) {
    var allCtaKw = NVJC.CTA_KEYWORDS.ko.concat(NVJC.CTA_KEYWORDS.en);

    // 1. CTA keyword frequency (saturates at 4 unique keywords found)
    var ctaCount = countKeywordMatches(text, allCtaKw);
    var ctaScore = clamp(ctaCount / 4, 0, 1);

    // 2. External link classification (only meaningful if ≥3 external links)
    var linkScore = 0;
    if (element) {
      var links = element.querySelectorAll('a[href]');
      var external   = 0;
      var marketing  = 0;
      links.forEach(function (a) {
        var href = a.href || '';
        if (!href.startsWith('http')) return;
        external++;
        var isOfficial = NVJC.OFFICIAL_DOMAINS.some(function (d) {
          return href.includes(d);
        });
        if (!isOfficial) marketing++;
      });
      if (external >= 3) {
        linkScore = marketing / external;
      }
    }

    return clamp(ctaScore * 0.65 + linkScore * 0.35, 0, 1);
  }

  // ── T_partial: Technical Specificity (0–1, higher = more concrete) ─────────
  //   Partial rule-based score; will be averaged with Ollama's T_semantic.

  function scoreTPartial(text, element) {
    var lower = text.toLowerCase();

    // 1. Presence of code blocks in DOM
    var hasCodeBlock = element
      ? (element.querySelector('code, pre') !== null)
      : false;

    // 2. Technical term density (unique hits, saturates at 6)
    var techHits = 0;
    NVJC.TECH_TERMS.forEach(function (term) {
      if (lower.includes(term)) techHits++;
    });
    var techScore = clamp(techHits / 6, 0, 1);

    // 3. Verifiable numbers with units: "20%", "100ms", "4 GB", "3.5x faster"
    var hasVerifiable = /\d+(\.\d+)?\s*(%|ms|GB|MB|TB|KB|fps|Hz|ns|x\s|×\s)/.test(text);

    // 4. Official domain links present in element
    var hasCitation = false;
    if (element) {
      var rawHtml = element.innerHTML || '';
      hasCitation = NVJC.OFFICIAL_DOMAINS.some(function (d) {
        return rawHtml.includes(d);
      });
    }

    var score = 0;
    if (hasCodeBlock)    score += 0.40;
    score               += techScore * 0.35;
    if (hasVerifiable)   score += 0.15;
    if (hasCitation)     score += 0.10;

    return clamp(score, 0, 1);
  }

  // ── Phase 1 Public Entry Point ─────────────────────────────────────────────

  /**
   * Runs Phase 1 rule-based scoring.
   * @param {string}  text    - element.innerText
   * @param {Element} element - DOM element (used for link/code analysis)
   * @returns {{ L: number, C: number, T_partial: number, pre: number }}
   *          L, C, T_partial are 0–1.
   *          pre = max(L, C, 1−T_partial) * 100  →  0–100, used as Ollama gate.
   *          Using max() ensures non-technical content (low T_partial) always
   *          triggers Ollama, even without explicit hype keywords.
   */
  function scoreRuleBased(text, element) {
    var L         = scoreL(text);
    var C         = scoreC(text, element);
    var T_partial = scoreTPartial(text, element);
    var pre       = Math.max(L, C, 1 - T_partial) * 100;

    return { L: L, C: C, T_partial: T_partial, pre: pre };
  }

  // ── AHI Aggregation (called after Phase 2 Ollama response) ────────────────

  /**
   * Combines Phase 1 rule-based scores with Phase 2 Ollama scores
   * into a single AHI value and breakdown.
   *
   * @param {{ L, C, T_partial }} phase1
   * @param {{ F, T_semantic }}   phase2   - F and T_semantic are 0–1
   * @param {{ w1, w2, w3, w4 }}  weights  - must sum to ~1.0
   * @returns {{ ahi: number, breakdown: { L, F, T, C } }}
   *          ahi is 0–100 (integer).
   *          breakdown values are 0–100 (integers, for display).
   */
  function aggregateAHI(phase1, phase2, weights) {
    var w  = weights || NVJC.DEFAULTS.WEIGHTS;
    var F  = (phase2 && phase2.F  != null) ? phase2.F  : 0;
    var Ts = (phase2 && phase2.T_semantic != null) ? phase2.T_semantic : 0.5;

    // Average partial + semantic T scores
    var T = (phase1.T_partial + Ts) / 2;

    var raw = w.w1 * phase1.L
            + w.w2 * F
            + w.w3 * (1 - T)
            + w.w4 * phase1.C;

    var ahi = Math.round(clamp(raw * 100, 0, 100));

    return {
      ahi: ahi,
      breakdown: {
        L: Math.round(phase1.L * 100),
        F: Math.round(F * 100),
        T: Math.round(T * 100),
        C: Math.round(phase1.C * 100),
      },
    };
  }

  return {
    scoreRuleBased: scoreRuleBased,
    aggregateAHI:   aggregateAHI,
  };
}());
