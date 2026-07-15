# 배포 설정 가이드 (GitHub Pages + Supabase)

이 사이트는 순수 정적 파일(HTML/CSS/JS)로만 되어 있고, 브라우저가 **Supabase에 직접** 접속합니다.
별도 백엔드 서버가 없습니다 — GitHub Pages는 파일만 서빙하면 됩니다.

- 콘텐츠(글)는 Supabase 데이터베이스에 저장됩니다.
- 사진은 Supabase Storage에 저장됩니다.
- 관리자 로그인은 Supabase Auth(이메일/비밀번호)가 처리하되, **admins 테이블에 등록된 사용자만**
  실제로 콘텐츠를 고칠 수 있습니다 (단순히 "로그인했는지"가 아니라 "관리자로 등록되어 있는지"로 판단합니다).
- 관리자 페이지에서 저장하면 **그 즉시** 반영되고, 공개 페이지는 열거나 새로고침할 때마다 최신 내용을 다시 불러옵니다(실시간 구독 없음 — 새로고침 기반으로 충분합니다).

모두 무료 요금제로 충분합니다.

---

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에서 무료 계정 생성 → **New project** 생성.
   - 생성 화면에 **"Enable Data API"**, **"Automatically expose new tables"**, **"Enable automatic RLS"** 같은 옵션이 보이면:
     `Enable Data API: ON` / `Automatically expose new tables: OFF` / `Enable automatic RLS: ON` 으로 두는 걸 권장합니다 —
     "새 테이블을 만들 때마다 자동으로 API에 노출시키지 않고, 명시적으로 권한을 준 것만 노출"하는 더 안전한 최신 기본값입니다.
     `schema.sql`은 이 설정을 그대로 가정하고 **테이블마다 필요한 GRANT 문을 직접 포함**하고 있으므로, 이 옵션들을 그대로 두셔도(또는 이미 이 옵션이 기본값인 프로젝트여도) 별도 조치 없이 정상 동작합니다.
2. 왼쪽 메뉴 **SQL Editor** → "New query" → 이 저장소의 `schema.sql` 내용을 전부 복사해서 붙여넣고 **Run**.
   - 테이블 5개(`activities`, `specialties`, `interests`, `settings`, `admins`) 생성
   - `is_admin()` 함수 생성
   - **Data API GRANT 권한** 설정 (`Automatically expose new tables: OFF` 환경에서 RLS만으로는 테이블이 API에 보이지 않기 때문에 필요 — anon에게는 조회만, authenticated에게는 조회/추가/수정/삭제 권한을 주되 실제 통과 여부는 RLS의 `is_admin()` 검사가 최종 결정합니다)
   - RLS 정책 설정 (조회는 전체 공개, 추가·수정·삭제는 **admins 테이블에 등록된 사용자만**)
   - `photos` Storage 버킷 생성 + 정책 설정 (Storage는 이 GRANT 변경의 영향을 받지 않는 별도 스키마라 추가 조치가 필요 없습니다)
   - 지금 사이트에 있는 내용이 초기 데이터로 들어감
   - 이 스크립트는 몇 번을 다시 실행해도 안전합니다(이미 실행했어도 다시 실행 가능).

---

## 2. 이메일 회원가입 비활성화 (중요 — 보안 필수 단계)

아무나 회원가입해서 로그인 시도를 하는 것 자체를 막기 위한 설정입니다.

1. 왼쪽 메뉴 **Authentication → Providers → Email** (또는 **Authentication → Sign In / Providers**, Supabase 버전에 따라 위치가 조금 다를 수 있습니다).
2. **"Allow new users to sign up"**(또는 "Enable email signups") 옵션을 **꺼짐(Off)**으로 설정.
3. 저장.

> 참고: 이 설정을 꺼도 이미 만든 계정으로 로그인하는 것에는 영향이 없습니다. 새로운 사람이 스스로 계정을 만드는 것만 막습니다.
> 혹시 이 설정을 깜빡 켜 둔 채로 누군가 회원가입에 성공하더라도, `admins` 테이블에 등록되어 있지 않으면 콘텐츠를 추가·수정·삭제할 수 없습니다 (RLS가 막습니다) — 이중 안전장치입니다.

---

## 3. 관리자 계정 만들기 (Supabase Auth + admins 테이블)

1. 왼쪽 메뉴 **Authentication → Users → Add user** → 선생님이 로그인에 사용할 **이메일 + 비밀번호**를 직접 정해서 사용자 1명 생성.
   ("Auto Confirm User"를 체크해서 이메일 인증 없이 바로 로그인 가능하게 만드세요.)
2. 방금 만든 사용자를 목록에서 클릭 → **User UID**(uuid 형식의 긴 문자열)를 복사합니다.
3. 왼쪽 메뉴 **SQL Editor** → 아래 SQL을 실행해서 그 사용자를 관리자로 등록합니다 (uuid와 이메일을 실제 값으로 바꿔서 실행):

   ```sql
   insert into admins (user_id, email)
   values ('여기에-복사한-UUID-붙여넣기', '선생님-이메일@example.com')
   on conflict (user_id) do nothing;
   ```

4. 등록이 잘 됐는지 확인:

   ```sql
   select * from admins;
   ```

   방금 등록한 행이 보이면 성공입니다. 이 표는 `service_role` 권한(SQL Editor)으로만 조회할 수 있고, 사이트 자체(브라우저)에서는 절대 조회되지 않습니다.

> 이 비밀번호는 저에게 알려주지 않으셔도 됩니다 — 관리자 페이지 로그인에만 사용하시면 됩니다.

---

## 4. Project URL / anon key를 저장소에 채워넣기

왼쪽 메뉴 **Project Settings → API**에서 아래 두 값을 복사합니다.

- **Project URL**
- **anon public key** (⚠️ **service_role** 키가 아니라 **anon** 키입니다. service_role 키는 절대 어디에도 붙여넣지 마세요 — RLS를 완전히 우회하는 마스터 키입니다.)

`public/js/supabase-client.js` 파일을 열어 채워 넣습니다:

```js
const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

이 두 값은 비밀값이 아니므로(anon key는 공개되어도 안전하도록 설계됨) 그대로 커밋해도 됩니다. 실제 접근 제어는 전부 2~3단계에서 설정한 RLS + admins 테이블이 담당합니다.

---

## 5. GitHub Pages로 배포하기

1. 이 저장소를 GitHub에 푸시합니다.
2. GitHub 저장소 페이지 → **Settings → Pages**.
3. **Source**: "Deploy from a branch" 선택 → Branch: `main`(또는 사용 중인 기본 브랜치) / Folder: `/ (root)` → **Save**.
4. 몇 분 뒤 `https://<GitHub 아이디>.github.io/<저장소 이름>/` 주소로 사이트가 열립니다.

---

## 6. 최종 확인 체크리스트

실제 Supabase/GitHub 환경에서 아래 순서로 하나씩 확인하세요.

- [ ] Supabase 프로젝트 생성 완료
- [ ] `schema.sql` 실행 완료 (에러 없이 끝까지 실행됨)
- [ ] Authentication에서 이메일 회원가입(Allow new users to sign up) 비활성화 확인
- [ ] 관리자용 Auth 사용자 생성 완료
- [ ] 그 사용자의 UUID 확인 완료
- [ ] `admins` 테이블에 해당 UUID 등록 완료 (`select * from admins;`로 확인)
- [ ] Project URL을 `public/js/supabase-client.js`에 설정
- [ ] anon key를 `public/js/supabase-client.js`에 설정 (service_role 키 아님!)
- [ ] Storage에 `photos` 버킷이 생성되어 있는지 확인 (Storage 메뉴에서 확인)
- [ ] Database → Tables에서 각 테이블에 RLS가 "Enabled"로 표시되는지 확인
- [ ] Storage → Policies에서 `photos` 버킷에 정책 3개(select/insert/update/delete 중 select·insert·update·delete)가 있는지 확인
- [ ] ("Automatically expose new tables"를 꺼 두셨다면) Database → Roles 또는 SQL Editor에서 `select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public';`를 실행해 `anon`/`authenticated`에 각 테이블 권한이 보이는지 확인
- [ ] GitHub Pages 배포 완료, 사이트 주소로 접속됨
- [ ] `admin.html`에서 관리자 계정으로 로그인 성공
- [ ] 활동 추가 → 홈/활동기록 페이지 새로고침 후 반영 확인
- [ ] 활동 수정 → 새로고침 후 반영 확인
- [ ] 활동 삭제 → 새로고침 후 목록에서 사라짐 확인
- [ ] 이미지 업로드 → 교체 → 삭제까지 전부 정상 동작 확인
- [ ] 로그인하지 않은 상태(시크릿 창 등)에서 관리자 페이지에 로그인 화면만 보이는지 확인
- [ ] 모바일 화면(휴대폰 또는 브라우저 좁게 줄이기)에서 관리자 페이지 사용 가능한지 확인
- [ ] 공개 페이지를 새로고침했을 때 매번 최신 데이터가 보이는지 확인

### 문제 해결: "Could not find the table 'public.xxx' in the schema cache" 오류가 보인다면

SQL Editor로 테이블을 만들면 가끔 PostgREST(Data API)가 새 테이블을 바로 인식하지 못할 때가 있습니다.
SQL Editor에서 아래 한 줄을 실행해서 스키마 캐시를 강제로 새로고침하면 해결됩니다:

```sql
NOTIFY pgrst, 'reload schema';
```

---

## 일반적인 사용 흐름

- **콘텐츠(글·사진) 관리** → `admin.html`에서만 처리합니다. GitHub을 건드릴 필요가 없습니다.
- **디자인이나 기능을 바꿀 때만** → 코드(HTML/CSS/JS)를 수정하고 GitHub에 다시 푸시합니다. GitHub Pages가 자동으로 재배포합니다.

---

## 로컬에서 미리 테스트하고 싶다면

빌드 과정이 없는 정적 사이트라, 아무 정적 서버로 열어보면 됩니다:

```
python3 -m http.server 8000
```

`http://localhost:8000` 접속 (1~4단계를 미리 마쳐서 `supabase-client.js`에 실제 값이 들어있어야 데이터가 보입니다).
