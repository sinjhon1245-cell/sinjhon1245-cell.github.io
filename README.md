# 진진쌤 · 교육활동 아카이브

초등교사 송진선(진진쌤)의 개인 교육활동 포트폴리오 사이트입니다.

- 운영 주소: https://sinjhon1245-cell.github.io/
- 배포: GitHub Pages (`main` 브랜치 루트를 그대로 서빙 — `main`에 push하면 곧바로 운영 반영)
- 구조: 정적 HTML/CSS/JS + 브라우저가 Supabase(DB·Storage·Auth)에 직접 접속. 별도 백엔드·빌드 없음.

## 파일 구성

```
index.html / records.html / about.html   공개 페이지 (홈 · 활동기록 · 소개)
admin.html                               관리자 페이지 (noindex, Supabase Auth + admins 테이블 검증)
public/css/style.css                     공개 페이지 스타일 (디자인 토큰은 :root)
public/css/admin.css                     관리자 페이지 스타일
public/js/site.js                        <head>에 먼저 로드되는 인라인 onerror용 최소 스크립트
public/js/supabase-client.js             Supabase URL / anon key / supabaseClient 전역
public/js/site-data.js                   공용 레이어: 데이터 조회, 정렬, 이미지 우선순위, 문구 기본값, 이미지 최적화
public/js/home.js / records.js / about.js  페이지별 렌더
public/js/admin.js                       관리자 기능 전체
public/images/activity-default/          분야별 기본 썸네일 (사진 없는 활동용, WebP)
public/images/activity-images/           큐레이션 삽화 (사진 없는 활동용, 960/1600 WebP)
schema.sql                               Supabase 스키마·RLS·Storage 정책 (이미 적용됨)
*_patch.sql / *_bulk_replace.sql / *_official.sql   과거 1회성 데이터 SQL — 이미 적용됨, 재실행 금지
SETUP.md                                 최초 구축 절차
.nojekyll                                GitHub Pages가 public/ 등을 그대로 서빙하게 함 — 삭제 금지
```

## 콘텐츠 관리

글·사진은 전부 `admin.html`에서 관리합니다. 저장하면 Supabase에 즉시 반영되고 공개 페이지는 새로고침 시 최신 데이터를 다시 읽습니다(실시간 구독 없음). 코드를 다시 배포할 필요가 없습니다.

- 활동 분야 6개(`AI·SW교육`, `과학·융합교육`, `프로젝트형 수업`, `디지털 기반 수업혁신`, `교사 연수`, `교육자료 개발`)는 `public/js/site-data.js`의 `ACTIVITY_FIELDS`가 단일 출처이며, 활동기록 필터·관리자 선택지·기본 썸네일 매핑이 여기서 파생됩니다. DB의 `activities.field` 값과 문자 단위로 정확히 일치해야 합니다(가운뎃점 `·` 포함).
- 연도 필터는 활동 데이터에서 자동 생성됩니다.
- 사이트 문구(히어로·소개·문의·푸터)는 `settings` 테이블 key/value로 저장되고, 저장값이 없으면 `SITE_COPY_DEFAULTS` 기본값이 쓰입니다. 새 문구 슬롯을 추가할 때는 `SITE_COPY_DEFAULTS`(site-data.js) · `COPY_FIELD_TYPES`/`COPY_GROUPS`(admin.js) · `admin.html` 폼 `name` 네 곳에 같은 key를 넣습니다.

## 리뉴얼 시 반드시 유지할 것

1. `public/js/supabase-client.js`의 URL·anon key·전역 변수명 `supabaseClient`(CDN 전역 `supabase`와 충돌하므로 이름을 바꾸지 말 것), 스크립트 로드 순서(supabase-js → supabase-client → site-data → 페이지 JS).
2. DB 컬럼명(`image_url`, `image_path`, `featured`, `featured_order`, `sort_order`, `start_year`, `end_year`, `is_current`, settings `key/value/path`)과 `settings` key 이름.
3. 관리자 인증 순서: `signInWithPassword` → `rpc('is_admin')` → 아니면 즉시 `signOut`. 서버 측 RLS/GRANT/`is_admin()`(schema.sql)은 건드리지 않음.
4. 사진 교체 순서: 새 파일 업로드 → DB 반영 성공 → 옛 파일 삭제(참조 확인 후) → 실패 시 방금 올린 파일 정리.
5. `sortActivitiesForDisplay`(연도↓ → sort_order↑ → created_at↓ → id↓)를 공개·관리자가 공유.
6. `resolveActivityImage`의 우선순위: 실제 업로드 사진 → 큐레이션 삽화 → 분야 기본 썸네일.
7. JS가 참조하는 id / class / `name` / `data-*` 이름. 스타일용 클래스는 자유롭게 추가·변경하되 훅 이름은 유지.
8. 모든 `innerHTML` 삽입은 `escHtml`을 거칠 것.
9. 저장소의 데이터 SQL 파일은 이미 적용된 이력입니다. 다시 실행하면 운영 데이터를 지우고 되돌립니다.

## 로컬에서 보기

빌드가 없으므로 아무 정적 서버로 루트를 열면 됩니다(예: `python -m http.server 8000`). Supabase 연결 정보가 `supabase-client.js`에 들어 있어야 데이터가 보입니다.

## 이력

- 2026-07: 최초 구축 (Claude Design 시안 → 정적 사이트 + Supabase)
- 2026-09: `fable-refresh` 리뉴얼 — 정체성·홈 구조·이미지 파이프라인·접근성·SEO·유지보수성 개선. 리뉴얼 직전 운영 상태는 태그 `backup-before-fable-refresh-20260918` / 브랜치 `backup/main-20260918`.
