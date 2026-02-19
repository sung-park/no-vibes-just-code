# PRD: No Vibes Just Code — Chrome Extension

**Version:** 1.1.0
**Status:** Draft
**Last Updated:** 2026-02-19

---

## 1. Overview

### 1.1 Product Summary

No Vibes Just Code는 Chrome 브라우저 확장 프로그램으로, 웹페이지 내의 AI 관련 과장·허위 홍보성 콘텐츠(AI Hype/Clickbait)를 **AI 호들갑 지수(AHI: AI Hype Index)**로 수치화하고 블라인드 처리합니다. 규칙 기반 사전 스코어링과 로컬 LLM(Ollama) 의미론적 분석을 결합한 하이브리드 파이프라인으로 동작하며, 사용자의 데이터가 외부 서버로 전송되지 않는 완전 오프라인 프라이버시를 보장합니다.

### 1.2 Problem Statement

- 기술 뉴스, SNS, 커뮤니티 사이트에는 AI 기능을 과장하거나 사실이 아닌 내용을 담은 홍보성 글이 범람하고 있습니다.
- 사용자가 개별적으로 이러한 콘텐츠를 판별하는 데는 피로도와 인지 비용이 높습니다.
- 기존 광고 차단기는 AI 특화 과장 콘텐츠를 규칙 기반으로 감지하기 어렵습니다.

### 1.3 Solution

**2-Phase 하이브리드 파이프라인**을 통해 속도와 정확도를 동시에 확보합니다.

- **Phase 1 — Rule-based Pre-scoring** (Content Script, API 호출 없음):
  언어적 인플레이션(L)과 상업적 의도(C)는 정규식·DOM 분석으로 즉시 측정합니다.
  사전 점수가 낮은 콘텐츠는 Ollama 호출을 건너뛰어 API 비용을 절감합니다.

- **Phase 2 — Semantic Scoring** (Background → Ollama):
  규칙으로 판별하기 어려운 공포/FOMO(F)와 기술 구체성(T) 차원을 LLM이 문맥을 이해하여 점수화합니다.

- **AHI 집계** (Content Script):
  4개 차원 점수를 가중합산하여 0~100의 단일 지수(AHI)로 환산하고, 임계값 초과 시 오버레이를 표시합니다.

---

## 2. Goals & Non-Goals

### Goals

- [G1] 4차원 AHI 모델(L, F, T, C)로 AI 과장 콘텐츠를 수치화
- [G2] 사전 스코어링으로 Ollama API 호출을 의심 콘텐츠에만 집중 (성능 최적화)
- [G3] 오버레이에 AHI 점수와 차원별 분석 결과를 시각화하여 표시
- [G4] 사용자가 블라인드 처리된 콘텐츠를 원클릭으로 원본 확인 가능
- [G5] Popup UI에서 확장 프로그램 ON/OFF 및 기본 설정 제어
- [G6] Options 페이지에서 AHI 가중치, 임계값, 예외 사이트 등 고급 설정 관리
- [G7] Chrome Web Store 배포 가능한 Manifest V3 구조
- [G8] 오픈소스 공개를 위한 코드 품질 및 문서화

### Non-Goals

- 클라우드 LLM API(OpenAI, Claude 등) 연동 (v1에서는 Ollama만 지원)
- Firefox, Safari 등 타 브라우저 지원
- 이미지·동영상 내 AI 과장 콘텐츠 감지
- 서버 사이드 처리 및 사용자 데이터 수집

---

## 3. AHI 모델 정의

### 3.1 산출 공식

```
AHI = w1·L + w2·F + w3·(1 − T) + w4·C    (0 ≤ AHI ≤ 100)
```

| 차원 | 기호 | 설명 | 측정 레이어 |
|------|------|------|------------|
| **언어적 인플레이션** | L | 최상급 표현 밀도, 이모지/! 남발, 추상 형용사 비율 | Rule-based (Content Script) |
| **공포/FOMO 유발** | F | 위협 단어 빈도, 시계열 긴박성, 사회적 비교 유도 | Semantic (Ollama) |
| **기술 구체성 결여** | 1−T | 근거 없는 수치 인용, 코드/전문 용어 부재, 수익화 키워드 근접성 | 혼합 (Rule + Ollama) |
| **상업적 전환 의도** | C | CTA 공격성, 마케팅 링크 비율, 외부 링크 유형 분석 | Rule-based (Content Script, DOM) |

### 3.2 기본 가중치

| 가중치 | 기본값 | 근거 |
|--------|--------|------|
| w1 (언어) | 0.20 | 문체 과장은 맥락에 따라 무해할 수 있음 |
| w2 (공포) | 0.35 | 공포 조장은 이성적 판단을 직접 해치므로 가장 높은 가중치 |
| w3 (기술 결여) | 0.25 | 알맹이 없는 콘텐츠의 핵심 지표 |
| w4 (상업) | 0.20 | 상업성 자체보다 조합된 위험성이 중요 |

### 3.3 Phase 1 임계값 (Pre-screening)

- `L_pre + C_pre ≥ 30` 이면 Phase 2(Ollama) 진입
- 미만이면 AHI < 30으로 간주하고 Ollama 호출 스킵
- 임계값은 Options 페이지에서 사용자 설정 가능

---

## 4. Target Users

| 페르소나 | 설명 |
|----------|------|
| **테크 리서처** | 기술 트렌드를 팔로우하되 과장 마케팅에 지쳐 있는 개발자/연구자 |
| **일반 소비자** | AI 관련 뉴스를 읽지만 과장 여부를 판별하기 어려운 일반 사용자 |
| **오픈소스 기여자** | Ollama 생태계, Chrome Extension 개발에 관심 있는 개발자 |

---

## 5. Feature Requirements

### 5.1 AHI Scorer (`shared/ahi-scorer.js`) — 신규

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| AHI-01 | L 점수: 최상급·역대급·혁명적 등 과장 형용사 밀도 계산 (한/영 키워드 사전) | Must |
| AHI-02 | L 점수: 문장당 `!`, `?`, 이모지(🔥🚀🤯💰) 밀도 계산 | Must |
| AHI-03 | L 점수: 구체적 수치 없는 추상 형용사("믿을 수 없는", "마법 같은") 감지 | Should |
| AHI-04 | C 점수: DOM에서 외부 링크 유형 분류 (공식 문서 vs 마케팅 링크) | Must |
| AHI-05 | C 점수: "신청하기", "구독", "전자책", "오픈채팅" 등 CTA 키워드 빈도 | Must |
| AHI-06 | T_partial 점수: 코드 블록 존재 여부, 기술 도구명(Python, API, SDK 등) 밀도 | Should |
| AHI-07 | Phase 1 사전 점수 계산 후 Ollama 진입 여부 결정 | Must |
| AHI-08 | 최종 AHI 가중합산: `w1·L + w2·F + w3·(1−T) + w4·C` | Must |

### 5.2 Background Service Worker

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| BG-01 | Content Script의 `ANALYZE_TEXT` 메시지를 수신하고 Ollama API 호출 | Must |
| BG-02 | Ollama API 엔드포인트·모델명을 `chrome.storage.sync`에서 동적으로 읽어 호출 | Must |
| BG-03 | Ollama에게 F(공포/FOMO)와 T_semantic(기술 구체성) 점수를 JSON으로 반환 요청 | Must |
| BG-04 | API 호출 실패 시 `{ F: 0, T: 1, error: 'OLLAMA_UNREACHABLE' }` 반환 (Safe Default) | Should |
| BG-05 | 탭별 AHI 통계(차단 수, 평균 AHI)를 `chrome.storage.session`에 저장 | Should |

### 5.3 Content Script

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| CS-01 | 페이지 로드 완료 후 본문·게시물·댓글 등의 텍스트 블록 DOM 파싱 | Must |
| CS-02 | 텍스트 길이 임계값(기본: 100자) 미만 블록은 건너뜀 | Must |
| CS-03 | 디바운싱(기본: 300ms)으로 연속 DOM 변화에 과도한 요청 방지 | Must |
| CS-04 | MutationObserver로 SPA 페이지의 동적 콘텐츠 감지 | Should |
| CS-05 | Phase 1: AHI Scorer로 L·C·T_partial 사전 점수 계산 | Must |
| CS-06 | Phase 1 점수 ≥ 임계값이면 Background로 Phase 2 요청, 미만이면 스킵 | Must |
| CS-07 | AHI ≥ 차단 임계값(기본: 60)이면 오버레이 표시, 점수 및 차원별 분석 포함 | Must |
| CS-08 | 오버레이 클릭 시 원본 콘텐츠 토글(표시/숨김) | Must |
| CS-09 | 이미 처리된 DOM 노드에 재처리 방지 플래그(`data-nvjc-processed`) 적용 | Must |
| CS-10 | 확장 프로그램 비활성화 시 기존 블라인드 처리 모두 해제 | Should |
| CS-11 | 차단된 블록 수와 평균 AHI를 Background에 보고 | Should |

### 5.4 Popup UI

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| PU-01 | 확장 프로그램 전역 활성화/비활성화 토글 스위치 | Must |
| PU-02 | 현재 탭에서 차단된 글의 개수와 평균 AHI 표시 | Must |
| PU-03 | Ollama API 주소 인라인 편집 입력란 (기본값: `http://localhost:11434`) | Should |
| PU-04 | 사용할 Ollama 모델명 인라인 편집 입력란 (기본값: `llama3.2`) | Should |
| PU-05 | Options 페이지로 이동하는 "고급 설정" 링크 | Should |
| PU-06 | Ollama 연결 상태 인디케이터 (연결됨/끊김) | Could |

### 5.5 Options 페이지

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| OP-01 | AHI 차단 임계값 슬라이더 (0~100, 기본: 60) | Must |
| OP-02 | Phase 1 Ollama 진입 임계값 설정 (기본: 30) | Should |
| OP-03 | 가중치 설정 슬라이더: w1(언어), w2(공포), w3(기술), w4(상업) — 합계 = 1.0 강제 | Should |
| OP-04 | 예외 사이트 목록 관리 (추가/삭제) | Should |
| OP-05 | 최소 텍스트 길이 임계값 설정 (50~500자) | Could |
| OP-06 | 설정 초기화(Reset to Defaults) 버튼 | Should |
| OP-07 | 설정 내보내기/가져오기 (JSON) | Could |

---

## 6. Technical Architecture

### 6.1 System Overview

```
┌───────────────────────────────────────────────────────────┐
│                      Chrome Browser                        │
│                                                            │
│  ┌──────────────┐         ┌──────────────────────────┐    │
│  │  Popup UI    │         │      Options Page         │    │
│  │  popup.html  │         │      options.html         │    │
│  └──────┬───────┘         └────────────┬─────────────┘    │
│         │                              │                   │
│         └──────────────┬───────────────┘                   │
│                        │ chrome.storage.sync               │
│         ┌──────────────▼──────────────────────────┐        │
│         │        Background Service Worker         │        │
│         │              background.js               │        │
│         │   Phase 2: Ollama semantic scoring        │        │
│         │   (F score, T_semantic score)             │        │
│         └──────────────┬──────────────────────────┘        │
│                        │ sendMessage (AHI sub-scores)      │
│         ┌──────────────▼──────────────────────────┐        │
│         │           Content Script                 │        │
│         │             content.js                   │        │
│         │  Phase 1: Rule-based scoring (L, C, T_p) │        │
│         │  Phase 2 gate → Background               │        │
│         │  AHI aggregation & overlay UI            │        │
│         │                                          │        │
│         │  uses → shared/ahi-scorer.js             │        │
│         └──────────────────────────────────────────┘        │
│                                                            │
└───────────────────────────────────────────────────────────┘
                             │
                             │ HTTP (localhost only)
                             ▼
                 ┌───────────────────────┐
                 │    Ollama Local API   │
                 │   localhost:11434     │
                 └───────────────────────┘
```

### 6.2 2-Phase 파이프라인

```
[Phase 1 — Content Script, 동기]
  ahi-scorer.scoreRuleBased(element)
  └── L: 언어 과장 점수 (regex, 키워드 사전)
  └── C: 상업 의도 점수 (DOM 링크 분석, CTA 키워드)
  └── T_partial: 기술 용어 부재 부분 점수

  L_pre + C_pre ≥ PRE_THRESHOLD(30)?
  │
  ├── NO  → AHI < 30 간주, 스킵 (Ollama 호출 없음)
  │
  └── YES → Phase 2 진입

[Phase 2 — Background → Ollama, 비동기]
  callOllamaAPI(text) → { F, T_semantic }
  └── F: 공포/FOMO 의미론적 점수
  └── T_semantic: 근거 없는 수치, 수익화 맥락 점수

[AHI 집계 — Content Script]
  T = (T_partial + T_semantic) / 2
  AHI = w1·L + w2·F + w3·(1−T) + w4·C   (×100)

  AHI ≥ BLOCK_THRESHOLD(60)?
  ├── YES → applyOverlay(element, ahiResult)
  └── NO  → 통과
```

### 6.3 Message Protocol

```javascript
// Content Script → Background (Phase 2 요청)
{
  action: "ANALYZE_TEXT",
  text: string,           // 분석할 텍스트
  preScores: {            // Phase 1 사전 점수 (컨텍스트 전달)
    L: number,
    C: number,
    T_partial: number
  }
}

// Background → Content Script (응답)
{
  F: number,              // 공포/FOMO 점수 (0~1)
  T_semantic: number,     // 기술 구체성 의미론 점수 (0~1, 높을수록 구체적)
  reason: string,         // 판별 근거 요약
  error?: string          // 에러 발생 시
}

// Content Script → Background (통계 보고)
{
  action: "UPDATE_STATS",
  tabId: number,
  count: number,          // 누적 차단 수
  avgAHI: number          // 평균 AHI
}

// Popup → Background (통계 조회)
{
  action: "GET_TAB_STATS",
  tabId: number
}
// → { count: number, avgAHI: number }
```

### 6.4 Ollama Prompt Design

```
You are an AI content analyst. Score the following text on two dimensions.
Respond ONLY with a valid JSON object, no explanation.

Dimensions:
- F (Fear/FOMO score, 0.0-1.0): How much does this text use fear, urgency,
  or social pressure to manipulate the reader? (e.g. "당신만 모른다", "도태된다",
  "지금 당장", "마지막 기회")
- T (Technical specificity, 0.0-1.0): How technically grounded is this text?
  (1.0 = full of verifiable facts, citations, code; 0.0 = vague, unverified claims)

Text:
"""
{text}
"""

Respond with: {"F": 0.0, "T": 0.0, "reason": "one sentence"}
```

### 6.5 Storage Schema

```javascript
// chrome.storage.sync (사용자 설정, 기기 간 동기화)
{
  "nvjc_enabled":          boolean,    // 활성화 여부 (default: true)
  "nvjc_api_url":          string,     // Ollama URL (default: "http://localhost:11434")
  "nvjc_model":            string,     // 모델명 (default: "llama3.2")
  "nvjc_block_threshold":  number,     // AHI 차단 임계값 (default: 60)
  "nvjc_pre_threshold":    number,     // Phase 1 진입 임계값 (default: 30)
  "nvjc_min_length":       number,     // 최소 텍스트 길이 (default: 100)
  "nvjc_debounce_ms":      number,     // 디바운싱 ms (default: 300)
  "nvjc_excluded_sites":   string[],   // 예외 도메인 (default: [])
  "nvjc_weights": {
    "w1": number,                      // 언어 인플레이션 (default: 0.20)
    "w2": number,                      // 공포/FOMO (default: 0.35)
    "w3": number,                      // 기술 결여 (default: 0.25)
    "w4": number                       // 상업 의도 (default: 0.20)
  }
}

// chrome.storage.session (런타임 상태, 세션 종료 시 초기화)
{
  "nvjc_stats_{tabId}": {
    "count":  number,                  // 탭별 차단 수
    "avgAHI": number                   // 탭별 평균 AHI
  }
}
```

---

## 7. File Structure

```
no-vibes-just-code/
├── manifest.json                  # Manifest V3 설정
├── README.md                      # 설치 가이드 및 문서
├── PRD.md                         # 본 문서
├── ARCHITECTURE.md                # 아키텍처 상세 설계
│
├── background.js                  # Service Worker (Phase 2: Ollama 호출)
├── content.js                     # Content Script (Phase 1 + AHI 집계 + 오버레이)
├── content.css                    # 오버레이 스타일
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
│   ├── constants.js               # 스토리지 키, 기본값, 액션 타입, 키워드 사전
│   ├── storage.js                 # chrome.storage 래퍼
│   └── ahi-scorer.js              # Rule-based AHI 스코어러 (Phase 1)
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 8. UI/UX Specifications

### 8.1 Popup (320×420px)

```
┌──────────────────────────────────┐
│  🛡 No Vibes Just Code  [ ● ON ] │  ← 토글 스위치
├──────────────────────────────────┤
│  이 페이지에서 차단된 글           │
│     ██ 3개   평균 AHI: 74        │  ← 카운트 + 평균 점수
├──────────────────────────────────┤
│  Ollama API                      │
│  [http://localhost:11434       ] │
│  모델                             │
│  [llama3.2                     ] │
│  ● 연결됨                        │
├──────────────────────────────────┤
│           [고급 설정 →]           │
└──────────────────────────────────┘
```

### 8.2 Content Overlay (AHI 점수 포함)

```
┌──────────────────────────────────────────┐
│  ⚠️  AI 호들갑 지수(AHI): 74 / 100       │
│                                          │
│  언어 과장   ████████░░  80              │
│  공포 조장   ██████░░░░  60              │
│  기술 결여   █████████░  90              │
│  상업 의도   ██████░░░░  65              │
│                                          │
│  판별 근거: "근거 없는 수익 수치,          │
│  FOMO 언어 다수, 기술 용어 전무"          │
│                                          │
│          [ 원문 보기 ]                    │
└──────────────────────────────────────────┘
```
- 배경: 반투명 다크 (#1a1a1a, opacity 0.90)
- 상단 테두리: AHI 점수에 따라 색상 변화
  - AHI 60~75: 주황 (#f59e0b)
  - AHI 76~90: 빨강 (#ef4444)
  - AHI 91~100: 진빨강 (#991b1b)
- 프로그레스 바: 각 차원별 색상 구분

### 8.3 Options Page

- **섹션 1: 일반 설정** — API URL, 모델, 예외 사이트
- **섹션 2: AHI 임계값** — 차단 임계값(0~100), Phase 1 진입 임계값
- **섹션 3: 가중치 설정** — w1~w4 슬라이더 (합계 1.0 실시간 검증)
- **섹션 4: 데이터 관리** — 설정 초기화, JSON 내보내기/가져오기

---

## 9. Non-Functional Requirements

| 항목 | 목표값 |
|------|--------|
| Phase 1 처리 시간 | < 5ms (동기, 규칙 기반) |
| Phase 2 네트워킹 오버헤드 | Ollama 추론 시간 제외 < 50ms |
| Ollama 호출 절감률 | Phase 1 필터로 전체 노드의 60% 이상 스킵 목표 |
| 메모리 사용 (Content Script) | 페이지당 < 20MB |
| 재처리 방지 | `data-nvjc-processed` 속성으로 중복 분석 차단 |
| 오류 격리 | Ollama 미실행 시 Phase 1 점수만으로 판별, Silent Fail |

---

## 10. Security & Privacy

- **로컬 전용 통신**: 모든 텍스트 데이터는 `localhost`의 Ollama로만 전송됩니다.
- **외부 네트워크 금지**: `manifest.json`의 `host_permissions`에 외부 도메인 미포함.
- **CSP 준수**: Manifest V3 기본 CSP 정책 준수, 인라인 스크립트 사용 금지.
- **권한 최소화**: `activeTab`, `storage`, `scripting` 권한만 요청.

---

## 11. Milestones

| Phase | 내용 | 산출물 |
|-------|------|--------|
| **Phase 1** | AHI Scorer + Content Script 핵심 파이프라인 | `shared/ahi-scorer.js`, `content.js`, `background.js` |
| **Phase 2** | UI 구현 | `popup.html/js`, `options.html/js` |
| **Phase 3** | 안정화 & 문서화 | `README.md`, 아이콘, 에러 처리 보강 |
| **Phase 4** | 배포 준비 | Chrome Web Store 제출 패키지 |

---

## 12. Open Questions

- [ ] Ollama 모델 자동 감지 기능 추가 여부 (`/api/tags` 엔드포인트 활용)
- [ ] 차단 통계 및 이력 페이지 필요 여부
- [ ] 다국어(i18n) 지원 범위 (ko, en 우선 고려)
- [ ] 한국어/영어 키워드 사전 분리 관리 방안
- [ ] AHI 스코어 피드백 기능 ("이 판별이 틀렸습니다") → 사전 개선에 활용
