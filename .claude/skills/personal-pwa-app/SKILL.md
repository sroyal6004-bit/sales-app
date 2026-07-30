---
name: personal-pwa-app
description: >-
  개인용 모바일 웹앱(PWA)을 만들 때 반드시 적용하는 표준 규칙 모음. 기록/일지/트래커/노트/컬렉션
  같은 개인 데이터 앱을 새로 만들거나 개선할 때, 사용자가 "같은 조건으로", "그때처럼", "골프
  노트 앱처럼" 만들어 달라고 하거나 폰↔데스크탑 동기화·오프라인·홈화면 설치·사진 첨부가 필요한
  앱을 요청하면 이 스킬을 사용한다. "앱 만들어줘", "PWA", "기기 간 동기화", "오프라인 앱",
  "뒤로가기 처리", "홈화면 앱" 등의 요청에서 적극적으로 발동할 것. 프레임워크·빌드도구 없이
  단일 HTML로 동작하는 모바일 우선 한국어 앱이 기본형이다.
---

# 개인용 PWA 앱 표준 (Personal PWA App Conventions)

이 스킬은 한 사용자와 함께 골프 학습·스코어 기록 앱을 만들며 검증한 규칙들을 정리한 것이다.
개인용 기록/트래커 앱을 만들 때 이 규칙을 기본값으로 적용하면, 매번 같은 완성도와 UX를
빠르게 재현할 수 있다. 각 규칙에는 "왜 그렇게 하는지"를 함께 적었으니, 상황에 맞게 판단해
응용할 것. 맹목적으로 따르기보다 사용자의 실제 요구에 맞춰 조정하는 게 목표다.

## 기본 형태

- **단일 파일 PWA**: `index.html`(UI·로직·스타일 한 파일) + `manifest.json` + `sw.js` +
  아이콘(`icon-192.png`, `icon-512.png`). 빌드 도구·프레임워크 없이 정적 호스팅(GitHub Pages 등)에
  바로 올라가야 한다. 비개발자도 파일만 있으면 쓸 수 있는 단순함이 핵심.
- **모바일 우선 + 한국어 UI + 다크 테마**가 기본. `viewport-fit=cover`와
  `env(safe-area-inset-*)`로 노치/홈바 대응, 탭 타깃은 넉넉히(≥44px).
- **오프라인 우선**: 네트워크 없이도 앱이 완전히 동작해야 한다. 온라인은 "동기화"라는
  부가 기능일 뿐, 앱의 전제 조건이 아니다.
- 아이콘은 앱 주제에 맞게 생성(Pillow 등으로 간단 제작 가능), `manifest.json`의 name/
  short_name/theme_color/background_color를 앱에 맞게 채운다.

## 1. 뒤로 가기(back) 제어 — 홈에서만 종료

**왜**: 폰에서 뒤로가기를 누르면 모달만 닫히길 기대하는데, 기본 웹앱은 앱 자체가 꺼져버려
사용자가 당황한다. 모달·시트·상세화면이 열려 있으면 그걸 닫고, 최상위 홈에서만 앱이 종료돼야
네이티브 앱처럼 자연스럽다.

**방법**: History API로 "레이어 스택"을 관리한다. 화면(모달/시트/라이트박스/서브탭)을 열 때마다
`history.pushState`로 항목을 쌓고, `popstate`(뒤로가기)에서 가장 위 레이어를 닫는다. 스택이
비어 있으면(=홈) 아무것도 안 해서 브라우저 기본 동작(종료/이전 페이지)이 일어난다.

```js
const uiStack = [];
function pushHist(tag){ try { history.pushState({t:tag},''); return true; } catch { return false; } }
function openLayer(tag, prep){ if(prep) prep(); showLayer(tag); uiStack.push({tag, pushed: pushHist(tag)}); }
function swapLayer(tag, prep){ const t=uiStack[uiStack.length-1]; if(t) hideLayer(t.tag); if(prep) prep(); showLayer(tag); if(t) t.tag=tag; else openLayer(tag); }
function uiBack(){ const t=uiStack[uiStack.length-1]; if(!t) return; if(t.pushed) history.back(); else { uiStack.pop(); hideLayer(t.tag); } }
window.addEventListener('popstate', () => { if(!uiStack.length) return; hideLayer(uiStack.pop().tag); });
```

- 모든 UI 닫기(취소·배경탭·저장 후)는 `uiBack()`로 통일하고, 실제 DOM 닫기는
  `hideLayer()`에서만 한다 → 뒤로가기와 버튼이 항상 같은 경로로 동작.
- 시트에서 "수정"처럼 한 화면을 다른 화면으로 **바꿀 때**는 `swapLayer`(히스토리 항목 유지).
- `pushState`가 막힌 환경(file://, null origin 등)은 `pushed:false`로 직접 닫기 폴백.

## 2. PWA 자동 업데이트 — 구버전 캐시에 묶이지 않게

**왜**: 서비스워커가 HTML을 "캐시 우선"으로 주면, 새 버전을 배포해도 사용자는 옛 화면에
영원히 묶인다(실제로 이 문제로 크게 헤맸다). 특히 홈화면에 설치한 PWA에서 치명적.

**방법**:
- `sw.js`에서 **HTML 문서는 네트워크 우선**(navigate/document 요청), 정적 파일만 캐시 우선.
- 캐시 이름에 버전을 넣고(`app-v3`), `activate`에서 이전 캐시 삭제 + `skipWaiting()` +
  `clients.claim()`.
- `index.html`에서 새 서비스워커가 제어를 넘겨받으면 **1회 자동 새로고침**:

```js
if (navigator.serviceWorker.controller) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if(reloaded) return; reloaded = true; location.reload(); });
}
window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{}));
```

- 외부 실시간 통신(Firebase 등) 도메인은 서비스워커 캐시에서 **반드시 제외**(통과)시킨다.

## 3. 기기 간 실시간 동기화 (Firebase)

**왜**: 폰에서 적고 데스크탑에서 보는 걸 사용자는 당연하게 기대한다. 계정·로그인 UI 없이도
쓸 수 있어야 비개발자가 편하다.

**방법 — "연결 코드" 모델**:
- 텍스트/구조 데이터는 **Firestore** 단일 문서 `spaces/{연결코드}`에 저장. 연결 코드가
  곧 비밀번호이자 경로(10자 이상, 추측 불가). 두 기기에 같은 코드를 넣으면 연결된다.
- 사진·동영상 등 큰 파일은 **Storage** `spaces/{연결코드}/{미디어ID}`에, 큰 파일은
  `uploadBytesResumable`(재개형)로 진행률 표시하며 업로드.
- 보안 규칙은 "코드를 아는 사람만" 접근하도록 경로 길이로 제한(로그인 없이도 안전한 수준):
  Firestore `allow get, write: if spaceId.size() >= 10; allow list: if false;`
  Storage `allow read: if spaceId.size() >= 10; allow write: if spaceId.size() >= 10 && request.resource.size < 500*1024*1024;`
- **병합 전략**: 각 항목에 `id`, `updated`(ms) 부여. 병합은 id 기준 최신 `updated` 우선.
  삭제는 실제 제거가 아니라 `deleted:true` **툼스톤**으로 표시해야 기기 간 삭제가 전파된다.
- `onSnapshot`으로 수신, 로컬과 병합해 상태 시그니처가 바뀔 때만 다시 렌더/재푸시(무한 루프 방지).
- Firebase SDK는 CDN 동적 `import()`로 필요할 때만 로드하고 실패해도 앱이 죽지 않게 try/catch.
- 동기화는 **선택 기능**: 코드가 없으면 그냥 로컬 단독 앱으로 완전히 동작.

## 4. 오프라인 저장 + 로딩 성능 (확장성)

**왜**: 데이터가 쌓여도 첫 화면이 느려지면 안 된다. 로컬에 있는데도 매번 다시 읽으면 낭비다.

**방법**:
- 텍스트/구조 데이터 → `localStorage`. 사진·동영상 원본 → `IndexedDB`(용량 큼, blob 저장).
- **메모리 캐시**: 한 번 만든 objectURL을 Map에 저장해 재렌더 시 즉시 표시(DB 재조회 X).
- **지연 로딩**: 목록의 썸네일은 `IntersectionObserver`로 **화면에 보일 때만** IndexedDB에서
  읽는다 → 첫 렌더 비용이 전체 개수가 아니라 "화면에 보이는 몇 개"로 고정돼 확장성 확보.
- 클라우드에서 받은 미디어는 백그라운드로 IndexedDB에 캐시 → 다음엔 오프라인에서도 즉시 표시.
- 원격 연결 완료 후에는 미디어를 한 번 다시 로드(연결 전에 렌더돼 클라우드에서 못 받은 것 복구).

## 5. 미디어 처리

- **이미지 자동 압축**: 첨부 시 canvas로 최대 1280px, JPEG 품질 가변(~0.5MB 목표)으로
  재인코딩. 원본보다 작을 때만 적용, EXIF 회전 반영(`createImageBitmap(f,{imageOrientation:'from-image'})`).
- **동영상**: 브라우저 내 압축은 비현실적(ffmpeg.wasm 등 과함). 원본 저장 + 큰 파일은
  resumable 업로드 + 진행률. 상한 초과 시 "이 기기에만 저장" 안내(조용한 실패 금지).
  아이폰 HEVC 등 데스크탑 브라우저 재생 불가 가능성은 미리 사용자에게 알린다.
- **스와이프 갤러리**: 사진 탭 → 그 항목의 미디어를 전체화면 뷰어로 열고 좌우 스와이프/화살표/
  키보드(←→Esc)로 이동, 현재 위치(n/전체) 표시, 양옆 미리 로딩. 닫기는 ×·배경탭·뒤로가기 모두.

## 6. 모바일 UX 패턴

- 하단에서 올라오는 **바텀시트 모달**, 우하단 **FAB(+)**, 상단 스티키 헤더 + 통계 카드,
  가로 스크롤 **칩 필터**, 짧게 뜨는 **토스트** 피드백, 항목 메뉴는 **액션 시트**.
- 입력 폼은 `-webkit-appearance:none`, 숫자는 `inputmode="numeric"`.
- 색/타이포는 CSS 변수로 토큰화해 일관성 유지. 다크 테마 기본.

## 7. 백업

**왜**: 로컬 저장은 브라우저 데이터 삭제 시 사라진다. 사용자에게 안전장치를 줘야 한다.
- 데이터(사진 제외 메타/텍스트)를 **JSON 내보내기/가져오기**. 가져오기는 id+updated 기준
  병합(덮어쓰기 아님).

## 8. 검증 후 커밋 (개발 워크플로)

**왜**: 비개발자 사용자는 직접 테스트하기 어렵다. 눈으로 "된다"고 말하기 전에 실제로 확인한다.
- 커밋 전 **Playwright 헤드리스 스모크 테스트**로 핵심 흐름(추가·수정·삭제·뒤로가기·갤러리 등)과
  콘솔/페이지 에러 0건을 확인. `file://`는 History API가 막히므로 **로컬 http 서버로 테스트**.
- 지정된 개발 브랜치에서 작업하고, 명확한 한국어 커밋 메시지로 커밋·푸시. PR은 사용자가
  명시적으로 요청할 때만.
- Firebase 등 외부 설정이 필요한 단계는, 비개발자가 따라올 수 있게 **콘솔 클릭 순서를
  화면 기준으로** 안내한다(탭 이름·버튼 위치까지).

## 적용 체크리스트

새 개인용 앱을 만들 때 위 규칙을 기본값으로 삼되, 앱 성격에 안 맞으면 뺀다:

- [ ] 단일 HTML PWA, 오프라인 우선, 모바일/다크/한국어
- [ ] 뒤로가기 레이어 제어(홈에서만 종료)
- [ ] PWA 자동 업데이트(HTML 네트워크 우선 + controllerchange 리로드)
- [ ] (필요 시) 연결 코드 기반 Firebase 동기화 + 툼스톤 병합
- [ ] localStorage/IndexedDB + 메모리 캐시 + 지연 로딩
- [ ] (미디어 있으면) 이미지 압축 + resumable 업로드 + 스와이프 갤러리
- [ ] JSON 백업/복원
- [ ] Playwright 스모크 테스트 후 커밋·푸시
