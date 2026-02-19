# Architecture: No Vibes Just Code

## 파일 트리

```
no-vibes-just-code/
├── manifest.json
├── README.md
├── PRD.md
├── ARCHITECTURE.md
│
├── background.js          ← Service Worker: Phase 2 Ollama 호출 (F, T_semantic)
├── content.js             ← Content Script: Phase 1 + AHI 집계 + 오버레이
├── content.css            ← 오버레이 스타일 (확장이 주입)
│
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
│
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
│
├── shared/
│   ├── constants.js       ← 스토리지 키, 기본값, 액션 타입, 키워드 사전
│   ├── storage.js         ← chrome.storage 래퍼 (get/set/onChanged)
│   └── ahi-scorer.js      ← Rule-based AHI 스코어러 (Phase 1: L, C, T_partial)
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 모듈별 책임 및 인터페이스

### `shared/constants.js`

모든 파일이 참조하는 단일 진실 소스(Single Source of Truth).

```javascript
// 스토리지 키 (prefix: nvjc_)
export const STORAGE_KEYS = {
  ENABLED:         'nvjc_enabled',
  API_URL:         'nvjc_api_url',
  MODEL:           'nvjc_model',
  BLOCK_THRESHOLD: 'nvjc_block_threshold',   // AHI 차단 임계값
  PRE_THRESHOLD:   'nvjc_pre_threshold',     // Phase 1 → Ollama 진입 임계값
  MIN_LENGTH:      'nvjc_min_length',
  DEBOUNCE_MS:     'nvjc_debounce_ms',
  EXCLUDED_SITES:  'nvjc_excluded_sites',
  WEIGHTS:         'nvjc_weights',           // { w1, w2, w3, w4 }
};

// 기본 설정값
export const DEFAULTS = {
  ENABLED:         true,
  API_URL:         'http://localhost:11434',
  MODEL:           'llama3.2',
  BLOCK_THRESHOLD: 60,
  PRE_THRESHOLD:   30,
  MIN_LENGTH:      100,
  DEBOUNCE_MS:     300,
  EXCLUDED_SITES:  [],
  WEIGHTS:         { w1: 0.20, w2: 0.35, w3: 0.25, w4: 0.20 },
};

// 메시지 액션 타입
export const ACTIONS = {
  ANALYZE_TEXT:   'ANALYZE_TEXT',
  UPDATE_STATS:   'UPDATE_STATS',
  GET_TAB_STATS:  'GET_TAB_STATS',
  GET_SETTINGS:   'GET_SETTINGS',
  PING_OLLAMA:    'PING_OLLAMA',
};

// 언어적 인플레이션 키워드 사전 (L 점수용)
export const HYPE_KEYWORDS = {
  ko: ['최고', '역대급', '미친', '혁명적', '완벽한', '소름', '충격', '믿기지 않는',
       '마법 같은', '전설', '압도적', '게임체인저', '도태', '멸망', '긴급'],
  en: ['revolutionary', 'game-changer', 'unprecedented', 'mind-blowing',
       'insane', 'crazy', 'unbelievable', 'shocking', 'must-see', 'urgent'],
};

// 상업적 의도 키워드 사전 (C 점수용)
export const CTA_KEYWORDS = {
  ko: ['신청하기', '구독', '전자책', '오픈채팅', '링크 클릭', '지금 바로',
       '무료 제공', '한정', '머니파이프라인', '부수입', '수익화'],
  en: ['subscribe', 'click here', 'sign up', 'limited offer', 'free ebook',
       'passive income', 'monetize', 'enroll now'],
};

// 기술 용어 사전 (T_partial 점수용 — 존재하면 구체성 UP)
export const TECH_TERMS = [
  'api', 'sdk', 'github', 'python', 'javascript', 'typescript', 'docker',
  'kubernetes', 'terraform', 'sql', 'postgresql', 'redis', 'webpack',
  'parameter', 'function', 'class', 'library', 'framework', 'benchmark',
];
```

---

### `shared/storage.js`

`chrome.storage.sync`와 `chrome.storage.session`에 대한 Promise 기반 래퍼.

```javascript
/**
 * 설정 전체 또는 특정 키 읽기
 * @param {string|string[]|null} keys
 * @returns {Promise<object>}
 */
export async function getSettings(keys = null) { ... }

/**
 * 설정 저장
 * @param {object} items
 * @returns {Promise<void>}
 */
export async function saveSettings(items) { ... }

/**
 * 기본값과 병합한 전체 설정 반환
 * @returns {Promise<object>}
 */
export async function getAllSettings() { ... }

/**
 * 탭별 통계 읽기 (session storage)
 * @param {number} tabId
 * @returns {Promise<{ count: number, avgAHI: number }>}
 */
export async function getTabStats(tabId) { ... }

/**
 * 탭별 통계 갱신 (session storage)
 * @param {number} tabId
 * @param {{ count: number, avgAHI: number }} stats
 * @returns {Promise<void>}
 */
export async function setTabStats(tabId, stats) { ... }
```

---

### `shared/ahi-scorer.js` — Phase 1 Rule-based Scorer

**역할**: DOM 요소와 텍스트를 입력받아 규칙 기반으로 L, C, T_partial 점수를 계산합니다.
API 호출 없이 동기적으로 실행되며, Ollama 호출 여부를 결정하는 게이트 역할을 합니다.

```javascript
/**
 * Phase 1 전체 사전 스코어링
 * @param {string} text       - element.innerText
 * @param {Element} element   - DOM 요소 (링크 분석용)
 * @returns {{ L: number, C: number, T_partial: number, pre: number }}
 *          pre = L + C (Ollama 진입 게이트 판단 기준)
 */
export function scoreRuleBased(text, element) { ... }

/**
 * L: 언어적 인플레이션 점수 (0~1)
 * - 과장 키워드 밀도 (HYPE_KEYWORDS 사전 매칭)
 * - 이모지(🔥🚀🤯💰) 밀도
 * - 문장당 !, ? 평균 개수
 * @param {string} text
 * @returns {number}
 */
function scoreL(text) { ... }

/**
 * C: 상업적 전환 의도 점수 (0~1)
 * - CTA 키워드 빈도 (CTA_KEYWORDS 사전)
 * - DOM 외부 링크 분류: 마케팅 링크 비율
 *   (공식 문서 도메인 whitelist와 비교)
 * @param {string} text
 * @param {Element} element
 * @returns {number}
 */
function scoreC(text, element) { ... }

/**
 * T_partial: 기술 구체성 부분 점수 (0~1, 높을수록 구체적)
 * - 코드 블록(<code>, <pre>) 존재 여부
 * - TECH_TERMS 사전 매칭 밀도
 * - 출처 링크(공식 도메인) 포함 여부
 * @param {string} text
 * @param {Element} element
 * @returns {number}
 */
function scoreTPartial(text, element) { ... }

/**
 * 최종 AHI 집계 (Phase 2 결과 수신 후 호출)
 * @param {{ L, C, T_partial }} phase1
 * @param {{ F, T_semantic }} phase2
 * @param {{ w1, w2, w3, w4 }} weights
 * @returns {{ ahi: number, breakdown: { L, F, T, C } }}
 */
export function aggregateAHI(phase1, phase2, weights) {
  const T = (phase1.T_partial + phase2.T_semantic) / 2;
  const ahi = Math.round(
    (weights.w1 * phase1.L +
     weights.w2 * phase2.F +
     weights.w3 * (1 - T) +
     weights.w4 * phase1.C) * 100
  );
  return {
    ahi: Math.min(100, Math.max(0, ahi)),
    breakdown: { L: phase1.L, F: phase2.F, T, C: phase1.C },
  };
}
```

---

### `background.js` — Service Worker (Phase 2)

**역할**: Content Script의 Phase 2 요청을 받아 Ollama API에서 F, T_semantic 점수를 받아 반환합니다.

```
┌─────────────────────────────────────────────────────┐
│                   background.js                      │
│                                                      │
│  chrome.runtime.onMessage.addListener               │
│  ├── ANALYZE_TEXT  → callOllamaAPI() → {F, T_semantic}
│  ├── UPDATE_STATS  → setTabStats()                  │
│  ├── GET_TAB_STATS → getTabStats()                  │
│  ├── PING_OLLAMA   → fetch(apiUrl + '/api/tags')    │
│  └── GET_SETTINGS  → getAllSettings()               │
│                                                      │
│  callOllamaAPI(text, settings)                      │
│  ├── buildPrompt(text) 조립                          │
│  ├── fetch(apiUrl + '/api/generate', {stream:false}) │
│  ├── JSON 파싱 → { F, T_semantic, reason }          │
│  └── 파싱 실패 시 → { F: 0, T_semantic: 1, error } │
│      (Safe Default: Ollama 오류 시 과차단 방지)      │
│                                                      │
│  buildPrompt(text)                                  │
│  └── F, T 점수 요청 프롬프트 생성                    │
└─────────────────────────────────────────────────────┘
```

**핵심 함수 시그니처:**

```javascript
// Ollama API 호출 — F와 T_semantic 반환
async function callOllamaAPI(text, settings)
// → { F: number, T_semantic: number, reason: string }
// → { F: 0, T_semantic: 1, error: 'OLLAMA_UNREACHABLE' }  (Safe Default)

// 프롬프트 조립
function buildPrompt(text)
// → { model: string, prompt: string, stream: false, format: 'json' }

// 메시지 라우터
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { ... })
```

**오류 처리 전략:**

| 오류 상황 | 반환값 | 이유 |
|----------|--------|------|
| Ollama 미실행/타임아웃 | `{ F: 0, T_semantic: 1 }` | 과차단 방지 — Phase 1만으로 낮은 AHI 유지 |
| JSON 파싱 실패 | `{ F: 0, T_semantic: 1 }` | 동일 |
| 네트워크 오류 | `{ F: 0, T_semantic: 1, error: 'NETWORK_ERROR' }` | Popup 상태 표시용 |

---

### `content.js` — Content Script (Phase 1 + 오케스트레이터)

**역할**: DOM 스캔 → Phase 1 스코어링 → Phase 2 게이팅 → AHI 집계 → 오버레이 삽입.

```
┌─────────────────────────────────────────────────────┐
│                    content.js                        │
│                                                      │
│  [초기화] init()                                    │
│  ├── 현재 사이트 예외 여부 확인                       │
│  ├── 확장 프로그램 활성화 여부 확인                   │
│  └── scanPage() + MutationObserver 등록             │
│                                                      │
│  scanPage()  [디바운싱 적용]                         │
│  ├── querySelectorAll(TEXT_SELECTORS)               │
│  └── data-nvjc-processed 없는 노드 → processNode() │
│                                                      │
│  processNode(element)                               │
│  ├── innerText 추출, MIN_LENGTH 미만 스킵            │
│  ├── data-nvjc-processed = 'pending' 마킹           │
│  │                                                  │
│  ├── [Phase 1] scoreRuleBased(text, element)        │
│  │   └── → { L, C, T_partial, pre }                │
│  │                                                  │
│  ├── pre < PRE_THRESHOLD?                           │
│  │   └── YES → AHI ≈ 낮음, 스킵                    │
│  │                                                  │
│  └── pre ≥ PRE_THRESHOLD → [Phase 2]               │
│      └── sendMessage(ANALYZE_TEXT, { text, preScores })
│          └── → { F, T_semantic, reason }            │
│              └── aggregateAHI(phase1, phase2, weights)
│                  └── AHI ≥ BLOCK_THRESHOLD          │
│                      └── applyOverlay(element, ahiResult)
│                                                      │
│  applyOverlay(element, ahiResult)                   │
│  ├── 원본 콘텐츠를 visibility:hidden (레이아웃 유지) │
│  ├── AHI 점수 + 차원별 프로그레스바 오버레이 삽입    │
│  ├── "원문 보기" 버튼 → toggleVisibility()          │
│  └── UPDATE_STATS 메시지 전송                        │
│                                                      │
│  data-nvjc-processed = 'done' 또는 'skip' 마킹     │
└─────────────────────────────────────────────────────┘
```

**선택자 전략 (`TEXT_SELECTORS`):**

```javascript
const TEXT_SELECTORS = [
  'article', '[role="article"]',
  '[data-testid="tweetText"]',          // Twitter/X
  '.entry-content', '.post-content',   // 블로그
  '.comment-body', '.comment-content', // 댓글
  '.article-body', '.story-body',      // 뉴스
  '.usertext-body', '.comment',        // Reddit, Hacker News
  'p',                                 // 폴백 (범용)
].join(', ');
```

**`data-nvjc-processed` 상태:**

| 값 | 의미 |
|----|------|
| `pending` | Phase 1 처리 중 (중복 실행 방지) |
| `skip` | Phase 1에서 낮은 점수로 스킵됨 |
| `done` | AHI 집계 완료 (차단 여부 무관) |

---

### `popup/popup.js` — Popup 로직

```
┌──────────────────────────────────────────┐
│               popup.js                   │
│                                          │
│  DOMContentLoaded                        │
│  ├── getAllSettings()                    │
│  ├── GET_TAB_STATS → { count, avgAHI }  │
│  ├── PING_OLLAMA → 연결 상태 표시        │
│  └── UI 렌더링                           │
│                                          │
│  이벤트 핸들러                            │
│  ├── 토글 스위치 → saveSettings(enabled) │
│  ├── API URL 변경 → debounce 저장        │
│  ├── 모델명 변경 → debounce 저장         │
│  └── "고급 설정" → openOptionsPage()    │
└──────────────────────────────────────────┘
```

---

### `options/options.js` — Options 로직

```
┌────────────────────────────────────────────┐
│               options.js                   │
│                                            │
│  DOMContentLoaded                          │
│  ├── 전체 설정 로드 → UI 반영              │
│  └── 예외 사이트 목록 렌더링               │
│                                            │
│  이벤트 핸들러                              │
│  ├── BLOCK_THRESHOLD 슬라이더 → 저장       │
│  ├── PRE_THRESHOLD 슬라이더 → 저장         │
│  ├── w1~w4 슬라이더 → 합계 1.0 검증 → 저장│
│  ├── 예외 사이트 추가/삭제 → 저장          │
│  ├── "초기화" → saveSettings(DEFAULTS)    │
│  ├── "내보내기" → JSON Blob 다운로드       │
│  └── "가져오기" → FileReader → 검증 → 저장│
└────────────────────────────────────────────┘
```

---

## 데이터 흐름도

```
사용자가 웹페이지 방문
        │
        ▼
[content.js] init()
        │
        ├─ 예외 사이트? → 종료
        ├─ 비활성화?   → 종료
        │
        ▼
[content.js] scanPage()  (MutationObserver 포함)
        │
        ▼
각 텍스트 노드 (data-nvjc-processed 없는 것만)
        │
        ├─ MIN_LENGTH 미만? → 스킵 (skip)
        │
        ▼
[Phase 1] ahi-scorer.scoreRuleBased(text, element)
        │
        └── { L, C, T_partial, pre }
                │
                ├─ pre < PRE_THRESHOLD(30)
                │        └─ AHI 낮음 간주 → 마킹(skip), 종료
                │
                └─ pre ≥ PRE_THRESHOLD(30)
                         │
                         ▼
        [Phase 2] sendMessage(ANALYZE_TEXT)
                         │
                         ▼
        [background.js] callOllamaAPI(text)
                         │
                         ▼
        fetch('localhost:11434/api/generate')
                         │
                         ▼
                { F, T_semantic, reason }
                         │
                         ▼
        [content.js] aggregateAHI(phase1, phase2, weights)
        AHI = w1·L + w2·F + w3·(1−T) + w4·C  (×100)
                         │
                ┌────────┴────────┐
        AHI < 60(기본)        AHI ≥ 60(기본)
                │                  │
           마킹(done)        applyOverlay()
                             ├─ 원본 숨김
                             ├─ AHI 점수 오버레이
                             ├─ 차원별 프로그레스바
                             └─ UPDATE_STATS 전송
```

---

## manifest.json 핵심 구조

```json
{
  "manifest_version": 3,
  "name": "No Vibes Just Code",
  "version": "1.0.0",
  "description": "AI 호들갑 지수(AHI)로 AI 과장 콘텐츠를 감지하고 블라인드 처리합니다.",
  "permissions": [
    "activeTab",
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": [
      "shared/constants.js",
      "shared/storage.js",
      "shared/ahi-scorer.js",
      "content.js"
    ],
    "css": ["content.css"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "options_ui": {
    "page": "options/options.html",
    "open_in_tab": true
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

---

## 구현 시 주의사항

### CORS 설정 (Ollama)

Background Service Worker에서 `localhost`로 fetch 시 Ollama CORS 정책에 의해 차단될 수 있습니다.

```bash
# macOS — launchd 영구 설정
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"

# 또는 터미널 세션 한정
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

### ES Module vs 전역 스크립트

| 파일 | 방식 | 이유 |
|------|------|------|
| `background.js` | ES Module (`type: "module"`) | `import/export` 사용 가능 |
| `shared/*.js` + `content.js` | 전통 스크립트 (전역 변수) | Content Script는 `type:module` 불가 |
| `popup/popup.js` | ES Module (`<script type="module">`) | HTML에서 직접 로드 |
| `options/options.js` | ES Module (`<script type="module">`) | HTML에서 직접 로드 |

> `shared/constants.js`, `shared/storage.js`, `shared/ahi-scorer.js`는 Content Script에서 전통 스크립트로 로드되므로, `export` 키워드 없이 전역 변수(`const STORAGE_KEYS = ...`)로 선언합니다.
> `background.js`와 popup/options에서는 같은 파일을 ES Module import로 사용하거나, 전역 변수를 그대로 참조합니다.

### 가중치 합계 검증 (Options)

w1 + w2 + w3 + w4 = 1.0 이어야 합니다. 슬라이더 하나를 조정 시 나머지를 비례 재조정하거나 저장 시 에러 표시로 처리합니다.

### 성능 고려사항

- `processNode()`는 디바운싱 래퍼 안에서 호출
- `data-nvjc-processed` 상태 관리로 중복 처리 완전 차단
- MutationObserver: `{ childList: true, subtree: true }` (attributes 제외)
- Phase 2 병렬 처리: 여러 노드의 Ollama 요청을 `Promise.allSettled`로 동시 발사 가능
