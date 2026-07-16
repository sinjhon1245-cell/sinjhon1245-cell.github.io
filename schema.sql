-- 진진쌤 교육활동 아카이브 — Supabase(Postgres) 스키마 + RLS 정책 + Storage 설정
--
-- 사용법: Supabase 프로젝트의 SQL Editor에 이 파일 내용을 전부 복사해서 붙여넣고 실행하세요.
-- 이 스크립트는 몇 번을 다시 실행해도 안전하도록(idempotent) 작성되어 있습니다 —
-- 이미 실행한 적이 있어도 다시 실행하면 됩니다.
--
-- 이 사이트는 GitHub Pages(정적 호스팅)에서 서비스되고, 브라우저가 Supabase에
-- 직접 접속합니다(별도 백엔드 서버 없음). 그래서 접근 제어는 전부 아래 RLS(행 수준 보안)
-- 정책이 담당합니다:
--   - 조회(select)는 누구나 가능 (공개 페이지가 읽어야 하므로)
--   - 추가/수정/삭제는 "admins 테이블에 등록된 사용자"만 가능
--     (단순히 "로그인한 사용자"가 아닙니다 — Supabase Auth로 로그인만 했다고 해서
--     콘텐츠를 고칠 수 있는 게 아니라, admins 테이블에 UUID가 등록되어 있어야만 가능합니다.)
--
-- 관리자 계정을 실제로 등록하는 절차는 이 파일만으로는 끝나지 않습니다 —
-- SETUP.md의 "관리자 계정 만들기" 섹션을 순서대로 따라 하세요
-- (Supabase Auth에 사용자 생성 → 그 사용자의 UUID를 admins 테이블에 등록).

-- ══════════════════════════════════════════════════════════════════════════
-- 1. 콘텐츠 테이블
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists activities (
  id bigint generated always as identity primary key,
  year int not null,
  title text not null,
  field text not null,
  role text not null,
  type text not null,
  description text not null default '',
  image_url text,
  image_path text,
  featured boolean not null default false,
  featured_order int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 기존에 image_path 없이 먼저 만든 적이 있어도 안전하게 컬럼만 추가합니다.
alter table activities add column if not exists image_path text;

create table if not exists specialties (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null,
  sort_order int not null default 0
);

create table if not exists interests (
  id bigint generated always as identity primary key,
  label text not null,
  sort_order int not null default 0
);

-- Single-image slots (hero photo, about-page portrait) — one row per key.
-- value = 공개 URL, path = Storage 안에서의 실제 경로(삭제할 때 이 값을 사용합니다).
create table if not exists settings (
  key text primary key,
  value text,
  path text
);

alter table settings add column if not exists path text;

-- 주요 이력 (소개 페이지 "주요 이력" 목록) — 관리자가 개수 제한 없이 추가·수정·
-- 삭제합니다. 기간 문자열("2024 – 현재" 등)은 저장하지 않고, 공개 페이지가
-- start_year/end_year/is_current로부터 화면에서 조합합니다.
create extension if not exists pgcrypto;

create table if not exists public.careers (
  id uuid primary key default gen_random_uuid(),
  start_year int not null,
  end_year int,
  is_current boolean not null default false,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 인덱스는 항상 부모 테이블(public.careers)과 같은 스키마(public)에 생성됩니다 —
-- CREATE INDEX 문법상 인덱스 이름 자체에는 스키마를 붙일 수 없습니다.
create index if not exists careers_start_year_idx on public.careers (start_year desc, created_at desc);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. 관리자 테이블 — "로그인한 사용자"가 아니라 "이 표에 등록된 사용자"만 관리자
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;
-- admins 테이블에는 select/insert/update/delete 정책을 하나도 만들지 않습니다.
-- RLS가 켜져 있고 정책이 없으면 PostgREST(브라우저 쪽 API)로는 아무도 이 표를
-- 읽거나 쓸 수 없습니다 — 관리자 목록 조회/변경은 Supabase 대시보드의 SQL Editor
-- (service_role 권한)로만 가능합니다.

-- 현재 로그인한 사용자가 admins 테이블에 등록되어 있는지 확인하는 함수.
-- security definer로 만들어서, 이 함수를 호출하는 쪽(anon/authenticated)이
-- admins 테이블에 대한 select 권한이 없어도 내부적으로는 확인할 수 있습니다.
-- 즉, 관리자 이메일/UUID를 프런트엔드 코드에 넣지 않고도 관리자 여부를 판별합니다.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from admins where user_id = auth.uid()
  );
$$;

grant execute on function is_admin() to anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Data API 노출을 위한 GRANT 권한
-- ══════════════════════════════════════════════════════════════════════════
--
-- 프로젝트 생성 시 "Automatically expose new tables" 옵션을 껐다면(권장 설정),
-- 새로 만든 테이블은 RLS 정책만으로는 API에서 전혀 보이지 않습니다 — PostgREST는
-- Postgres 차원의 GRANT가 먼저 있어야 그 테이블에 대한 요청 자체를 시도하고,
-- 그 다음에야 RLS 정책이 "실제로 허용할지"를 행 단위로 판단합니다. 즉 GRANT는
-- "이 역할이 이 종류의 작업을 시도라도 할 수 있는지"이고, RLS는 "이번 요청을
-- 실제로 허용할지"입니다 — 두 층이 함께 있어야 합니다.
--
-- anon에게는 select만 주고(공개 조회), authenticated에게는 select/insert/
-- update/delete를 전부 주되, 실제로 쓰기가 통과되는지는 아래 RLS 정책의
-- is_admin() 검사가 결정합니다 (관리자가 아니면 GRANT가 있어도 RLS가 막습니다).

grant usage on schema public to anon, authenticated;

grant select on public.activities to anon;
grant select, insert, update, delete on public.activities to authenticated;

grant select on public.specialties to anon;
grant select, insert, update, delete on public.specialties to authenticated;

grant select on public.interests to anon;
grant select, insert, update, delete on public.interests to authenticated;

grant select on public.settings to anon;
grant select, insert, update, delete on public.settings to authenticated;

grant select on public.careers to anon;
grant select, insert, update, delete on public.careers to authenticated;

-- admins 테이블은 일부러 아무 grant도 주지 않습니다 — anon/authenticated 둘 다
-- 이 표를 API로 전혀 건드릴 수 없어야 합니다(관리자 목록 조회·변경 자체를 차단).
-- is_admin() 함수는 security definer라서 이 grant와 무관하게 내부적으로 조회합니다.

-- id 컬럼이 generated always as identity라 내부적으로 시퀀스를 사용합니다 —
-- insert 시 이 시퀀스 값을 가져오려면 authenticated에게 시퀀스 권한도 필요합니다.
grant usage, select on all sequences in schema public to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. RLS 활성화
-- ══════════════════════════════════════════════════════════════════════════

alter table activities enable row level security;
alter table specialties enable row level security;
alter table interests enable row level security;
alter table settings enable row level security;
alter table public.careers enable row level security;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. RLS 정책 — 조회는 전체 공개, 추가·수정·삭제는 is_admin()인 사용자만
--    (예전에 "로그인한 사용자면 누구나" 정책을 이미 만들었다면 먼저 지웁니다)
-- ══════════════════════════════════════════════════════════════════════════

-- activities
drop policy if exists "activities_select_public" on activities;
drop policy if exists "activities_insert_auth" on activities;
drop policy if exists "activities_update_auth" on activities;
drop policy if exists "activities_delete_auth" on activities;
drop policy if exists "activities_insert_admin" on activities;
drop policy if exists "activities_update_admin" on activities;
drop policy if exists "activities_delete_admin" on activities;

create policy "activities_select_public" on activities for select using (true);
create policy "activities_insert_admin" on activities for insert with check (is_admin());
create policy "activities_update_admin" on activities for update using (is_admin()) with check (is_admin());
create policy "activities_delete_admin" on activities for delete using (is_admin());

-- specialties
drop policy if exists "specialties_select_public" on specialties;
drop policy if exists "specialties_insert_auth" on specialties;
drop policy if exists "specialties_update_auth" on specialties;
drop policy if exists "specialties_delete_auth" on specialties;
drop policy if exists "specialties_insert_admin" on specialties;
drop policy if exists "specialties_update_admin" on specialties;
drop policy if exists "specialties_delete_admin" on specialties;

create policy "specialties_select_public" on specialties for select using (true);
create policy "specialties_insert_admin" on specialties for insert with check (is_admin());
create policy "specialties_update_admin" on specialties for update using (is_admin()) with check (is_admin());
create policy "specialties_delete_admin" on specialties for delete using (is_admin());

-- interests
drop policy if exists "interests_select_public" on interests;
drop policy if exists "interests_insert_auth" on interests;
drop policy if exists "interests_update_auth" on interests;
drop policy if exists "interests_delete_auth" on interests;
drop policy if exists "interests_insert_admin" on interests;
drop policy if exists "interests_update_admin" on interests;
drop policy if exists "interests_delete_admin" on interests;

create policy "interests_select_public" on interests for select using (true);
create policy "interests_insert_admin" on interests for insert with check (is_admin());
create policy "interests_update_admin" on interests for update using (is_admin()) with check (is_admin());
create policy "interests_delete_admin" on interests for delete using (is_admin());

-- settings (히어로 사진 / 프로필 사진 — insert는 seed 데이터 넣을 때만 필요, update가 실제 교체 경로)
drop policy if exists "settings_select_public" on settings;
drop policy if exists "settings_insert_auth" on settings;
drop policy if exists "settings_update_auth" on settings;
drop policy if exists "settings_insert_admin" on settings;
drop policy if exists "settings_update_admin" on settings;

create policy "settings_select_public" on settings for select using (true);
create policy "settings_insert_admin" on settings for insert with check (is_admin());
create policy "settings_update_admin" on settings for update using (is_admin()) with check (is_admin());

-- careers
drop policy if exists "careers_select_public" on public.careers;
drop policy if exists "careers_insert_admin" on public.careers;
drop policy if exists "careers_update_admin" on public.careers;
drop policy if exists "careers_delete_admin" on public.careers;

create policy "careers_select_public" on public.careers for select using (true);
create policy "careers_insert_admin" on public.careers for insert with check (public.is_admin());
create policy "careers_update_admin" on public.careers for update using (public.is_admin()) with check (public.is_admin());
create policy "careers_delete_admin" on public.careers for delete using (public.is_admin());

-- ══════════════════════════════════════════════════════════════════════════
-- 6. Storage — 사진 버킷 + 정책 (조회는 전체 공개, 업로드·수정·삭제는 관리자만)
-- ══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos_select_public" on storage.objects;
drop policy if exists "photos_insert_auth" on storage.objects;
drop policy if exists "photos_delete_auth" on storage.objects;
drop policy if exists "photos_insert_admin" on storage.objects;
drop policy if exists "photos_update_admin" on storage.objects;
drop policy if exists "photos_delete_admin" on storage.objects;

create policy "photos_select_public" on storage.objects for select using (bucket_id = 'photos');
create policy "photos_insert_admin" on storage.objects for insert with check (bucket_id = 'photos' and is_admin());
create policy "photos_update_admin" on storage.objects for update using (bucket_id = 'photos' and is_admin());
create policy "photos_delete_admin" on storage.objects for delete using (bucket_id = 'photos' and is_admin());

-- ══════════════════════════════════════════════════════════════════════════
-- 7. 입력값 검증 — 데이터베이스 쪽 최소 안전장치 (프런트엔드 검증과 별개로 항상 적용됨)
-- ══════════════════════════════════════════════════════════════════════════

alter table activities drop constraint if exists activities_title_length;
alter table activities add constraint activities_title_length check (char_length(title) between 1 and 200);

alter table activities drop constraint if exists activities_description_length;
alter table activities add constraint activities_description_length check (char_length(description) <= 2000);

alter table activities drop constraint if exists activities_year_range;
alter table activities add constraint activities_year_range check (year between 2000 and 2100);

alter table specialties drop constraint if exists specialties_name_length;
alter table specialties add constraint specialties_name_length check (char_length(name) between 1 and 100);

alter table specialties drop constraint if exists specialties_description_length;
alter table specialties add constraint specialties_description_length check (char_length(description) <= 1000);

alter table interests drop constraint if exists interests_label_length;
alter table interests add constraint interests_label_length check (char_length(label) between 1 and 50);

alter table interests drop constraint if exists interests_label_unique;
alter table interests add constraint interests_label_unique unique (label);

alter table public.careers drop constraint if exists careers_title_length;
alter table public.careers add constraint careers_title_length check (char_length(btrim(title)) between 1 and 300);

alter table public.careers drop constraint if exists careers_start_year_range;
alter table public.careers add constraint careers_start_year_range check (start_year between 1950 and 2100);

alter table public.careers drop constraint if exists careers_end_year_range;
alter table public.careers add constraint careers_end_year_range check (end_year is null or end_year between 1950 and 2100);

-- is_current가 true이면 end_year는 반드시 null이어야 합니다.
alter table public.careers drop constraint if exists careers_current_no_end;
alter table public.careers add constraint careers_current_no_end check (not is_current or end_year is null);

-- end_year가 있다면(= is_current가 false인 경우) start_year 이상이어야 합니다.
alter table public.careers drop constraint if exists careers_end_after_start;
alter table public.careers add constraint careers_end_after_start check (end_year is null or end_year >= start_year);

-- ══════════════════════════════════════════════════════════════════════════
-- 8. 초기 데이터 — 지금 사이트에 있는 내용 그대로 (이미 들어있으면 건너뜁니다)
-- ══════════════════════════════════════════════════════════════════════════

insert into activities (year, title, field, role, type, description, featured, featured_order, sort_order) values
  (2026, 'AI 디지털교과서 활용 수업 실천 연구', '디지털 기반 수업혁신', '연구', '프로젝트', 'AI 디지털교과서를 교과 수업에 적용하고 학생 반응과 학습 데이터를 분석한 실천 연구.', true, 1, 1),
  (2026, '학급 AI 리터러시 프로젝트 ''질문하는 교실''', 'AI·SW교육', '기획·운영', '수업', '생성형 AI를 비판적으로 읽고 활용하는 한 학기 학급 프로젝트 수업.', false, null, 2),
  (2025, '교육청 초등 교원 AI 활용 연수 강사', '교사 연수', '강사', '연수', '초등 교원 대상 AI 활용 수업 설계 연수 3기 운영 및 강의.', false, null, 3),
  (2025, '과학의 달 융합탐구 주간 운영', '과학·융합교육', '기획·운영', '대회·행사', '전교생이 참여하는 융합탐구 주간을 기획하고 학년별 탐구 부스를 운영.', false, null, 4),
  (2025, '초등 SW·AI 수업자료집 공동 개발', '교육자료 개발', '개발', '자료개발', '학년군별 SW·AI 수업 지도안과 활동지를 담은 자료집 공동 집필.', false, null, 5),
  (2024, '학교 안 메이커 스페이스 구축·운영', '프로젝트형 수업', '기획·운영', '프로젝트', '유휴 교실을 메이커 공간으로 바꾸고 학년별 메이커 프로젝트를 운영.', true, 2, 6),
  (2024, '에듀테크 선도교사단 활동', '디지털 기반 수업혁신', '연구', '연수', '에듀테크 도구의 수업 적용 사례를 발굴하고 지역 학교에 컨설팅.', false, null, 7),
  (2024, '학년 융합 프로젝트 ''우리 동네 생태 지도''', '프로젝트형 수업', '기획·운영', '수업', '과학·사회·미술을 잇는 학년 공동 생태 탐사 프로젝트 수업.', false, null, 8),
  (2023, '초등 데이터 리터러시 수업 사례 나눔', 'AI·SW교육', '강사', '연수', '데이터로 질문하고 답을 찾는 수업 사례를 동료 교사들과 공유.', false, null, 9),
  (2023, '학생 과학탐구 발표대회 지도', '과학·융합교육', '기획·운영', '대회·행사', '학생 탐구 동아리의 주제 선정부터 발표까지 전 과정 지도.', false, null, 10),
  (2023, '디지털 교수학습 플랫폼 활용 가이드 제작', '교육자료 개발', '개발', '자료개발', '교내 선생님들을 위한 플랫폼 활용 단계별 가이드 문서 제작.', false, null, 11)
on conflict do nothing;

insert into specialties (name, description, sort_order) values
  ('AI·SW교육', '초등 수준에 맞는 AI 리터러시와 소프트웨어 교육을 설계하고, 교실에서 직접 실천하며 다듬습니다.', 1),
  ('과학·융합교육', '탐구 중심의 과학 수업과 교과를 넘나드는 융합 수업으로 아이들의 질문을 키웁니다.', 2),
  ('프로젝트형 수업', '삶과 연결된 주제를 프로젝트로 풀어내며, 과정과 결과물을 함께 기록합니다.', 3),
  ('디지털 기반 수업혁신', '에듀테크와 디지털 도구를 수업의 목적에 맞게 녹여, 배움의 방식 자체를 새롭게 합니다.', 4),
  ('교사 연수', '교실에서 검증한 실천 사례를 동료 선생님들과 나누는 연수를 기획하고 진행합니다.', 5),
  ('교육자료 개발', '수업자료집·가이드·콘텐츠를 개발해, 좋은 수업이 더 많은 교실로 퍼지도록 돕습니다.', 6)
on conflict do nothing;

insert into interests (label, sort_order) values
  ('AI 리터러시', 1),
  ('데이터 기반 탐구', 2),
  ('메이커 교육', 3),
  ('프로젝트 학습', 4),
  ('수업 나눔', 5)
on conflict do nothing;

insert into settings (key, value) values
  ('hero_image_url', null),
  ('about_portrait_url', null)
on conflict (key) do nothing;

-- 고정 UUID + ON CONFLICT DO NOTHING — 이 SQL을 여러 번 실행해도 중복 삽입되지
-- 않고, 현재 존재하는 초기 행(관리자가 이미 수정/삭제한 행 포함)을 덮어쓰지
-- 않습니다. 다만 관리자가 이 초기 행을 삭제한 뒤 이 SQL을 다시 실행하면 해당
-- 행이 그대로 재삽입될 수 있습니다. 관리자 화면에서 이 4개를 삭제하거나 새
-- 이력을 추가할 수 있습니다(예시일 뿐).
insert into public.careers (id, start_year, end_year, is_current, title) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 2024, null, true, '에듀테크 선도교사단 · 디지털 기반 수업혁신 연구'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 2023, null, true, '교육청 초등 교원 연수 강사 (AI·SW교육)'),
  ('a1a1a1a1-0000-4000-8000-000000000003', 2022, null, true, '초등 SW·AI 수업자료 공동 개발진'),
  ('a1a1a1a1-0000-4000-8000-000000000004', 2019, null, true, '초등학교 교사 재직')
on conflict (id) do nothing;
