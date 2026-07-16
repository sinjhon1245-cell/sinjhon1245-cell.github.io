-- careers_bulk_replace.sql
--
-- 기존 주요 이력 전체를 교체하는 SQL
--
-- ⚠️ 아직 실제 Supabase 프로젝트에 실행되지 않았습니다 — 파일만 작성했습니다.
--
-- 용도: public.careers 테이블에 들어있는 기존 이력을 전부 지우고, 최종 확정된
-- 13개 이력으로 일괄 교체하는 일회성 데이터 SQL입니다.
--
-- 이 파일은 데이터(행)만 바꿉니다 — public.careers 테이블 구조, 제약조건,
-- RLS 정책, GRANT 권한은 전혀 건드리지 않고, activities/specialties/
-- interests/settings/admins 등 다른 테이블도 전혀 건드리지 않습니다.
-- (테이블/정책/권한을 새로 맞추려면 careers_table_patch.sql을 먼저 실행하세요.)
--
-- 이 파일은 몇 번을 다시 실행해도 안전합니다(idempotent) — 매번 기존 행을
-- 전부 지운 뒤 아래 13개를 다시 넣으므로, 여러 번 실행해도 최종 상태는
-- 항상 이 13개 행 그대로입니다.
--
-- 실행 방법: Supabase 프로젝트의 SQL Editor에 이 파일 내용을 전부 붙여넣고 Run.
-- (전체가 begin/commit 트랜잭션으로 감싸져 있어, 중간에 에러가 나면 전체가 롤백됩니다.)

begin;

-- 기존 이력 전체 삭제 — public.careers 데이터만 지웁니다.
delete from public.careers;

-- 최종 확정된 13개 이력 등록 — 각 행은 서로 다른 고정 UUID를 사용합니다.
-- is_current가 true인 행은 end_year를 반드시 null로 저장하고, 단년도 이력은
-- start_year와 end_year를 같은 값으로 저장합니다. created_at/updated_at은
-- 테이블 기본값(now())을 그대로 사용합니다.
insert into public.careers (id, start_year, end_year, is_current, title) values
  ('c9d0f650-718d-4183-8b56-2ae3c0600dba', 2026, 2026, false, '경인교육대학교 교육실습 지도교사'),
  ('025a0102-f4c7-42b4-a1ee-66141f75eeea', 2026, null, true,  '인천 지역공동 SW영재학급 운영·관리교사'),
  ('5f839b8a-3a14-4d3e-b602-b9a1aaed41c5', 2025, null, true,  '경인교육대학원 인공지능융합교육과 석사과정 (인천광역시교육청 AI융합교육대학원 교육지원 대상자)'),
  ('2f7a880b-de40-4fae-8007-59470353f336', 2025, null, true,  'Class-IT 초등 교육·에듀테크 교과 연구지원단'),
  ('8f466a4c-b27b-4663-add5-3a7c9d277d45', 2025, null, true,  '읽걷쓰 기반 AI 기초 융합교육(STEAM) 프로그램 개발 연구진'),
  ('6893b053-e46a-41fa-ac02-6b5c663a7dc1', 2025, 2025, false, '인천광역시 AI융합교육 교사지원단'),
  ('d969d491-6eaf-43db-a307-1b2258633916', 2025, 2025, false, '인천광역시교육청 지정 디지털 기반 학생 맞춤교육 연구학교 참여 교원'),
  ('933f9323-1135-48bd-ac3c-2c155969a92c', 2024, 2025, false, '하이터치·하이테크(HTHT) 팀 선도 교원'),
  ('86ab761b-4ca7-49d4-8ce0-310e5b9a6a8a', 2024, 2024, false, '제18회 디지털교육연구대회 시도대회(인천) 디지털 교수·학습분과 2등급'),
  ('f23fd1b2-cb20-45f1-8133-876d74dcd5e5', 2023, null, true,  '인천광역시교육청 과학사랑지원단 교사위원'),
  ('be932add-46b1-4ae1-a621-e50248181853', 2023, null, true,  '한국과학창의재단 디지털새싹 프로그램 강사'),
  ('cdf73084-759d-49f0-8fe6-04883d9653a9', 2023, 2025, false, '인천교육과학정보원 찾아가는 최첨단 교실 AI융합공학기술 강사'),
  ('bf500d04-27f2-4af1-bc1f-b65250f0ee41', 2023, 2023, false, '한국과학창의재단 지능형 과학실 과학 탐구 교수·학습자료 개발 연구진');

commit;
