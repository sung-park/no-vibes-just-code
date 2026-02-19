// shared/constants.js — No Vibes Just Code
// Loaded as a traditional content script before content.js, storage.js, ahi-scorer.js.
// Top-level var declarations are shared across all scripts in the same content_scripts context.

/* global var */ var NVJC = (function () {
  'use strict';

  var STORAGE_KEYS = {
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

  var DEFAULTS = {
    ENABLED:         true,
    API_URL:         'http://localhost:11434',
    MODEL:           'qwen2.5:3b',
    BLOCK_THRESHOLD: 40,
    PRE_THRESHOLD:   30,
    MIN_LENGTH:      100,
    DEBOUNCE_MS:     300,
    EXCLUDED_SITES:  [],
    WEIGHTS:         { w1: 0.15, w2: 0.50, w3: 0.20, w4: 0.15 },
  };

  var ACTIONS = {
    ANALYZE_TEXT:  'ANALYZE_TEXT',
    UPDATE_STATS:  'UPDATE_STATS',
    GET_TAB_STATS: 'GET_TAB_STATS',
    GET_SETTINGS:  'GET_SETTINGS',
    PING_OLLAMA:   'PING_OLLAMA',
  };

  // L score: Linguistic Inflation keywords
  var HYPE_KEYWORDS = {
    ko: [
      // 과장 형용사
      '최고', '역대급', '미친', '혁명적', '완벽한', '소름', '충격적',
      '믿기지않는', '마법같은', '전설', '압도적', '게임체인저', '도태',
      '멸망', '긴급', '대박', '레전드', '어마어마', '사기급', '넘사벽',
      '역사상', '인류최초', '획기적', '파격적', '폭발적',
      // 비즈니스 과장 (추가)
      '가능하겠다', '가능하겠어', '될 것 같다', '될 것 같아',
      '세상이 바뀌', '판이 바뀌', '시대가 바뀌',
      '다 먹어', '싹쓸이', '독점', '시장 장악',
      '누구나 가능', '나도 가능', '당신도 가능',
      '안 쓰면 손해', '모르면 손해', '놓치면 후회',
      '자동화', '자동으로', '알아서',
      '터졌다', '미쳤다', '난리났다', '화제',
    ],
    en: [
      'revolutionary', 'game-changer', 'game changer', 'unprecedented',
      'mind-blowing', 'insane', 'crazy', 'unbelievable', 'shocking',
      'must-see', 'disruptive', 'transformative', 'groundbreaking',
      'unmatched', 'jaw-dropping', 'explosive',
      'you can too', 'anyone can', 'so easy', 'just works',
      'changed my life', 'life-changing', 'quit my job',
    ],
  };

  // C score: Commercial Intent keywords
  var CTA_KEYWORDS = {
    ko: [
      '신청하기', '구독', '전자책', '오픈채팅', '지금 바로', '무료 제공',
      '한정', '머니파이프라인', '부수입', '수익화', '클릭', '가입하기',
      '링크 클릭', '영상 보기', '지금 확인', '무료공개', '비밀공개',
      '월수익', '자동화수익', '파이프라인',
      // 비즈니스 수익 관련 (추가)
      '연매출', '월매출', '일매출', '순수익', '매출 달성',
      '수익 인증', '인증샷', '월 천만', '월 억',
      '쿠팡', '스마트스토어', '아마존', '드롭쉬핑', '위탁판매',
      '소싱', '마진', '광고비 대비', 'roas',
      '직원 없이', '혼자서', '퇴근 후',
    ],
    en: [
      'subscribe', 'click here', 'sign up', 'limited offer', 'free ebook',
      'passive income', 'monetize', 'enroll now', 'join now', 'buy now',
      'get access', 'download now', 'money pipeline', 'side hustle',
      'dropshipping', 'e-commerce', 'make money', 'earn money',
      'financial freedom', 'quit your job', '6 figures', '7 figures',
    ],
  };

  // T score: Technical terms that indicate specificity (higher presence = more technical)
  var TECH_TERMS = [
    'api', 'sdk', 'github', 'python', 'javascript', 'typescript', 'docker',
    'kubernetes', 'terraform', 'sql', 'postgresql', 'redis', 'webpack', 'vite',
    'parameter', 'function', 'class', 'library', 'framework', 'benchmark',
    'llm', 'transformer', 'embedding', 'fine-tuning', 'rag', 'inference',
    'dataset', 'model', 'token', 'prompt', 'latency', 'throughput',
    'huggingface', 'langchain', 'openai', 'anthropic',
  ];

  // Domains considered "official/technical" for link scoring
  var OFFICIAL_DOMAINS = [
    'github.com', 'docs.', 'arxiv.org', 'wikipedia.org',
    'developer.chrome.com', 'developer.mozilla.org', 'stackoverflow.com',
    'huggingface.co', 'openai.com', 'anthropic.com', 'pytorch.org',
    'tensorflow.org', 'scikit-learn.org', 'numpy.org', 'papers.', 'arxiv',
    'medium.com/@', 'research.',
  ];

  return {
    STORAGE_KEYS:     STORAGE_KEYS,
    DEFAULTS:         DEFAULTS,
    ACTIONS:          ACTIONS,
    HYPE_KEYWORDS:    HYPE_KEYWORDS,
    CTA_KEYWORDS:     CTA_KEYWORDS,
    TECH_TERMS:       TECH_TERMS,
    OFFICIAL_DOMAINS: OFFICIAL_DOMAINS,
  };
}());
