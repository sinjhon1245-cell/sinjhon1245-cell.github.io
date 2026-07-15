-- post_setup_patch.sql
--
-- ⚠️ 아직 실제 Supabase 프로젝트에 실행되지 않았습니다 (2026-07-15 기준, 로컬 작성만 완료).
--
-- 용도: 이전 버전의 schema.sql을 이미 실행한 프로젝트에서, 나중에 추가된
-- "Data API GRANT 권한" 부분만 별도로 적용하기 위한 패치입니다.
-- 테이블 생성문·초기 콘텐츠 INSERT문은 들어있지 않습니다 — 이미 실행하신
-- 원본 schema.sql이 그 역할을 다 했으므로 중복 실행하지 않기 위함입니다.
--
-- 배경: Supabase 프로젝트를 "Automatically expose new tables: OFF"로 생성하면,
-- RLS 정책만으로는 테이블이 Data API에 노출되지 않습니다. PostgREST가 요청을
-- 시도라도 하려면 Postgres 차원의 GRANT가 먼저 있어야 하고, 그 다음에 RLS가
-- "이번 요청을 실제로 허용할지"를 행 단위로 판단합니다 — 이 파일은 그 GRANT
-- 레이어만 추가합니다.
--
-- 실행 방법: Supabase 프로젝트의 SQL Editor에 이 파일 내용을 전부 붙여넣고 Run.
-- 몇 번을 다시 실행해도 안전합니다(모두 idempotent한 GRANT 문입니다).

-- ── 1. public 스키마 사용 권한 ──

grant usage on schema public to anon, authenticated;

-- ── 2. anon: 공개 콘텐츠 조회(SELECT)만 ──

grant select on public.activities to anon;
grant select on public.specialties to anon;
grant select on public.interests to anon;
grant select on public.settings to anon;

-- ── 3. authenticated: 조회(SELECT) ──
--    (실제로 조회/추가/수정/삭제가 통과되는지는 이 GRANT와 무관하게
--     RLS 정책의 is_admin() 검사가 최종 결정합니다 — GRANT는 "시도 가능 여부",
--     RLS는 "허용 여부"입니다.)

grant select on public.activities to authenticated;
grant select on public.specialties to authenticated;
grant select on public.interests to authenticated;
grant select on public.settings to authenticated;

-- ── 4. authenticated: 관리자 CRUD에 필요한 최소 INSERT·UPDATE·DELETE ──

grant insert, update, delete on public.activities to authenticated;
grant insert, update, delete on public.specialties to authenticated;
grant insert, update, delete on public.interests to authenticated;
grant insert, update, delete on public.settings to authenticated;

-- ── 5. identity 컬럼(id)이 쓰는 시퀀스 사용 권한 ──
--    (id bigint generated always as identity 컬럼은 내부적으로 시퀀스를 쓰므로
--     INSERT 시 authenticated가 그 시퀀스 값을 가져올 수 있어야 합니다.)

grant usage, select on all sequences in schema public to authenticated;

-- ── 6. admins 테이블 — 의도적으로 아무 권한도 주지 않음 ──
--    admins 테이블에는 select/insert/update/delete 권한을 anon/authenticated
--    어느 쪽에도 주지 않습니다. 관리자 목록은 오직 Supabase 대시보드의
--    SQL Editor(service_role 권한)로만 조회·수정할 수 있어야 합니다.
--    is_admin() 함수는 security definer이므로 이 권한 부재와 무관하게
--    내부적으로 admins 테이블을 조회할 수 있습니다 — 아래에는 아무 GRANT도
--    작성하지 않는 것 자체가 의도된 보안 설정입니다.

-- (참고: storage.objects는 이 "Automatically expose new tables" 변경의 영향을
--  받지 않는 별도 스키마이며, 기존에 실행하신 schema.sql의 Storage 정책이
--  이미 정상 동작합니다 — 이 패치에서 재생성하지 않습니다.)

-- ── 7. PostgREST 스키마 캐시 새로고침 ──
--    GRANT 변경 후 Data API가 바로 인식하지 못하는 경우가 있어 강제 반영합니다.

NOTIFY pgrst, 'reload schema';
