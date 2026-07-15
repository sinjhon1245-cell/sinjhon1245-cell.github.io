-- careers_table_patch.sql
--
-- ⚠️ 아직 실제 Supabase 프로젝트에 실행되지 않았습니다 (2026-07-16 기준, 로컬 작성만 완료).
--
-- 용도: 이미 schema.sql을 실행해 운영 중인 기존 Supabase 프로젝트에, 새로 추가된
-- "주요 이력(careers)" 테이블만 별도로 적용하기 위한 패치입니다.
-- activities/specialties/interests/settings/admins 등 기존 테이블은 이 파일에서
-- 전혀 건드리지 않습니다 — CREATE/ALTER/DROP 대상은 오직 careers 테이블뿐입니다.
--
-- 이 파일은 몇 번을 다시 실행해도 안전합니다(idempotent):
--   - create table/index/extension은 모두 IF NOT EXISTS
--   - 정책(policy)은 DROP 후 CREATE로 재실행 가능하게 처리
--   - 초기 4개 예시 이력은 고정 UUID + ON CONFLICT DO NOTHING이라 중복 삽입되지 않고,
--     이미 관리자 화면에서 수정/삭제한 데이터를 덮어쓰지 않습니다.
--
-- 실행 방법: Supabase 프로젝트의 SQL Editor에 이 파일 내용을 전부 붙여넣고 Run.

-- ── 1. gen_random_uuid()에 필요한 확장 (Supabase 프로젝트는 보통 이미 켜져 있음) ──

create extension if not exists pgcrypto;

-- ── 2. careers 테이블 생성 ──
--    기간 문자열("2024 – 현재" 등)은 저장하지 않습니다 — 공개 페이지가
--    start_year/end_year/is_current로부터 화면에서 직접 조합합니다.

create table if not exists careers (
  id uuid primary key default gen_random_uuid(),
  start_year int not null,
  end_year int,
  is_current boolean not null default false,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists careers_start_year_idx on careers (start_year desc, created_at desc);

-- ── 3. 입력값 검증 제약조건 ──

alter table careers drop constraint if exists careers_title_length;
alter table careers add constraint careers_title_length check (char_length(title) between 1 and 300);

alter table careers drop constraint if exists careers_start_year_range;
alter table careers add constraint careers_start_year_range check (start_year between 1950 and 2100);

alter table careers drop constraint if exists careers_end_year_range;
alter table careers add constraint careers_end_year_range check (end_year is null or end_year between 1950 and 2100);

-- is_current가 true이면 end_year는 반드시 null이어야 합니다.
alter table careers drop constraint if exists careers_current_no_end;
alter table careers add constraint careers_current_no_end check (not is_current or end_year is null);

-- end_year가 있다면(= is_current가 false인 경우) start_year 이상이어야 합니다.
alter table careers drop constraint if exists careers_end_after_start;
alter table careers add constraint careers_end_after_start check (end_year is null or end_year >= start_year);

-- ── 4. RLS 활성화 + 정책 — 조회는 전체 공개, 추가·수정·삭제는 is_admin()인 사용자만 ──
--    is_admin()은 기존 schema.sql에서 이미 만든 함수를 그대로 재사용합니다
--    (이 패치에서 새로 정의하지 않습니다).

alter table careers enable row level security;

drop policy if exists "careers_select_public" on careers;
drop policy if exists "careers_insert_admin" on careers;
drop policy if exists "careers_update_admin" on careers;
drop policy if exists "careers_delete_admin" on careers;

create policy "careers_select_public" on careers for select using (true);
create policy "careers_insert_admin" on careers for insert with check (is_admin());
create policy "careers_update_admin" on careers for update using (is_admin()) with check (is_admin());
create policy "careers_delete_admin" on careers for delete using (is_admin());

-- ── 5. 최소 권한 GRANT ──
--    anon은 select만, authenticated는 select/insert/update/delete만 부여합니다.
--    truncate/references/trigger 권한은 부여하지 않습니다.
--    id가 uuid(gen_random_uuid() 기본값)라 identity 시퀀스를 쓰지 않으므로
--    별도 시퀀스 GRANT는 필요 없습니다.

grant usage on schema public to anon, authenticated;

grant select on public.careers to anon;
grant select, insert, update, delete on public.careers to authenticated;

-- ── 6. 초기 예시 데이터 — 현재 소개 페이지에 있는 4개 항목 ──
--    고정 UUID + ON CONFLICT DO NOTHING이라 이미 등록되어 있으면 건너뜁니다.
--    관리자 화면에서 이 4개를 삭제하거나 새 이력을 추가할 수 있습니다(예시일 뿐).

insert into careers (id, start_year, end_year, is_current, title) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 2024, null, true, '에듀테크 선도교사단 · 디지털 기반 수업혁신 연구'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 2023, null, true, '교육청 초등 교원 연수 강사 (AI·SW교육)'),
  ('a1a1a1a1-0000-4000-8000-000000000003', 2022, null, true, '초등 SW·AI 수업자료 공동 개발진'),
  ('a1a1a1a1-0000-4000-8000-000000000004', 2019, null, true, '초등학교 교사 재직')
on conflict (id) do nothing;

-- ── 7. PostgREST 스키마 캐시 새로고침 ──
--    새 테이블 + GRANT가 Data API에 바로 인식되지 않는 경우가 있어 강제 반영합니다.

NOTIFY pgrst, 'reload schema';
