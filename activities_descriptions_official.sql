-- activities_descriptions_official.sql
--
-- 활동기록 29건의 description을 공식적인 개조식 2줄 문구로 통일하는
-- 일회성 데이터 SQL입니다.
--
-- ⚠️ 아직 실제 Supabase 프로젝트에 실행되지 않았습니다 — 파일만 작성했습니다.
-- Supabase 프로젝트의 SQL Editor에 이 파일 내용을 전부 붙여넣고 Run 하세요.
--
-- 이 파일은 public.activities.description 컬럼만 바꿉니다 — title, year,
-- field, role, type, sort_order, featured, featured_order, image_url,
-- image_path 등 다른 컬럼은 전혀 건드리지 않고, activities 외 다른 테이블
-- (specialties/interests/settings/careers/admins 등)도 전혀 건드리지 않습니다.
-- insert/delete 없이 update만 사용하므로 활동 29건, 정렬 순서, 대표 활동
-- 지정은 그대로 유지됩니다.
--
-- 각 update문은 id와 title을 함께 조건으로 사용합니다 — id만으로 매칭하면
-- 데이터가 재적재(bulk replace)되어 id가 바뀐 경우에도 조건절이 그대로 통과해
-- 엉뚱한 행을 수정할 위험이 있으므로, title이 일치하지 않으면 아무 행도
-- 바뀌지 않게 하는 안전장치입니다.
--
-- 줄바꿈은 E'첫째 줄\n둘째 줄' 형식의 실제 개행 문자로 저장합니다(HTML
-- <br> 태그 아님). 화면에 그대로 두 줄로 보이려면 해당 요소에
-- white-space: pre-line이 적용되어 있어야 하며, public/css/style.css의
-- .featured-card p에 이번 작업에서 함께 추가했습니다.
--
-- 전체가 begin/commit 트랜잭션으로 감싸져 있어, 중간에 에러가 나면 전체가
-- 롤백됩니다.

begin;

update public.activities
set description = E'SW영재학급 교육과정 설계 및 수업 운영\n학생 지도·강사 협업·교육활동 관리'
where id = 15
  and title = '인천 지역공동 SW영재학급 운영·관리';

update public.activities
set description = E'학교 디지털교육 운영 현황 분석\n수업혁신 방향 설정 및 교원 역량 강화 지원'
where id = 18
  and title = 'AI·디지털 기반 학교 컨설팅';

update public.activities
set description = E'교육실습생 수업 설계 및 학급 운영 지도\n에듀테크 활용·교직 실무 지도'
where id = 19
  and title = '경인교육대학교 교육실습 지도';

update public.activities
set description = E'AI·디지털 제작 도구 활용 메이커 교육\n학생 참여형 특강 진행 강사'
where id = 20
  and title = 'AI 디지털 메이커스 캠프 특강';

update public.activities
set description = E'학생 과학콘텐츠 제작 지도 및 작품 피드백\n과학콘텐츠 분과 기획 및 운영'
where id = 21
  and title = '제28회 인천과학대제전 과학콘텐츠 분과 운영';

update public.activities
set description = E'읽걷쓰 기반 창의융합수업 사례 개발\n수업 실천 결과 정리 및 공유'
where id = 28
  and title = '읽걷쓰 4P 기반 창의융합수업 스토리메이커';

update public.activities
set description = E'읽걷쓰·AI 기초교육 연계 융합교육 프로그램 개발\n초등 교수·학습자료 공동 개발'
where id = 29
  and title = '읽걷쓰 기반 AI 기초 융합교육(STEAM) 프로그램·교수학습자료 개발';

update public.activities
set description = E'AI융합교육 수업 확산 연구\n학교 현장 지원 및 교원 지원 활동'
where id = 30
  and title = '인천광역시 AI융합교육 교사지원단';

update public.activities
set description = E'에듀테크 기반 수업 사례 개발\n공개수업 적용 및 실천 결과 공유'
where id = 31
  and title = 'Class-IT 초등 교육·에듀테크 교과 연구지원단';

update public.activities
set description = E'과학적 쟁점 탐구 및 토론 역량 프로그램 기획\n캠프 기획·운영 및 특강 강사'
where id = 34
  and title = '인천 청소년 과학토론캠프 운영 및 특강';

update public.activities
set description = E'디지털 기반 수업실천 사례 분석\n현장 적용 사례 교원 대상 공유'
where id = 35
  and title = '하이터치·하이테크 수업실천사례 추진단';

update public.activities
set description = E'저경력 교사 수업 설계 지원\n학교 업무 적응 및 정착 지원'
where id = 36
  and title = '찾아가는 저경력 교사 지원단';

update public.activities
set description = E'디지털 기반 학생 맞춤교육 이해 연수 설계\n수업 적용 사례 중심 교원 연수 운영'
where id = 37
  and title = '디지털 기반 학생 맞춤교육 선도학교 교원 역량강화 연수';

update public.activities
set description = E'프로그래밍·컴퓨팅 사고력 중심 수업 설계\nSW영재학급 수업 운영 강사'
where id = 43
  and title = '인천 지역공동 SW영재학급 강사';

update public.activities
set description = E'AI·공학기술 융합 체험 수업 설계\n학교 현장 방문형 수업 운영'
where id = 44
  and title = '찾아가는 최첨단 교실 AI융합공학기술 교육';

update public.activities
set description = E'디지털 기반 교수·학습 실천 사례 연구\n인천 시도대회 디지털 교수·학습분과 2등급 수상'
where id = 45
  and title = '제18회 디지털교육연구대회 디지털 교수·학습 연구';

update public.activities
set description = E'디지털 기반 학생 맞춤교육 수업 사례 개발\n선도교원 활동 및 학교 현장 확산'
where id = 46
  and title = '하이터치·하이테크 팀 선도교원 활동';

update public.activities
set description = E'발명교육 프로그램 기획·운영\n교육자료 개발 및 현장 지원'
where id = 47
  and title = '인천광역시교육청 발명교육지원단';

update public.activities
set description = E'초등 발명교육 교재 및 활동자료 개발\n창의적 문제해결 역량 지원 자료 설계'
where id = 48
  and title = '인천 발명교육 교재 개발';

update public.activities
set description = E'학교 현장 과학실 구축 자문\n수업 활용 방안 컨설팅 수행'
where id = 49
  and title = '지능형 과학실 구축·활용 컨설팅';

update public.activities
set description = E'디지털 센서·탐구 도구 활용 과학수업 설계\n지능형 과학실 활용 방법 안내 연수'
where id = 50
  and title = '지능형 과학실 활용 교원 연수';

update public.activities
set description = E'AI·과학·융합교육 수업 실천 사례 정리\n성과공유회 세션 강의 및 사례 공유'
where id = 51
  and title = '인천창의융합교육 성과공유회 세션 강의';

update public.activities
set description = E'초등과학 수업용 디지털 콘텐츠 개발\n활동자료 제작 및 현장 보급'
where id = 52
  and title = '초등과학 수업자료 개발 및 보급';

update public.activities
set description = E'자연관찰·과학탐구 연계 프로그램 설계\n읽기·걷기·쓰기 활동 기획·운영'
where id = 53
  and title = '자연을 읽·걷·쓰 자연관찰 탐구교실';

update public.activities
set description = E'한국과학창의재단 주관 사업 참여\n과학 탐구 교수·학습자료 공동 개발'
where id = 54
  and title = '지능형 과학실 과학 탐구 교수·학습자료 개발';

update public.activities
set description = E'학생·가족 참여형 체험·탐구 과학 프로그램 기획\n체험형 캠프 운영 및 강의 진행'
where id = 55
  and title = '가족공동과학캠프 운영 및 강의';

update public.activities
set description = E'프로그래밍·컴퓨팅 사고력 향상 수업 설계\n단위학교 SW영재학급 수업 강사'
where id = 56
  and title = '단위학교 SW영재학급 수업';

update public.activities
set description = E'과학 체험·탐구 프로그램 분과 계획 수립\n현장 운영 기획 및 진행 담당'
where id = 57
  and title = '인천과학대제전 분과 기획 및 운영';

update public.activities
set description = E'AI 원리·활용 체험형 프로그램 설계\n학생 참여형 AI교육 수업 진행'
where id = 58
  and title = 'AI선도학교 프로그램 수업';

commit;

select
  id,
  sort_order,
  title,
  description
from public.activities
order by sort_order asc;
