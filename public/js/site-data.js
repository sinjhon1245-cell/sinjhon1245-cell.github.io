// Throws a clearly-marked error before any network call if supabase-client.js
// still has its placeholder values — turns a confusing network failure into
// an actionable message.
function assertSupabaseConfigured() {
  if (typeof SUPABASE_CONFIGURED === 'undefined' || !SUPABASE_CONFIGURED) {
    const err = new Error('Supabase 연결 정보가 설정되지 않았습니다.');
    err.isConfigMissing = true;
    throw err;
  }
}

// Turns a raw Supabase/JS error into a specific, actionable Korean message.
// Always logs the original error for developers via console.error, but never
// logs request bodies, tokens, or session objects (nothing sensitive).
function describeSupabaseError(err) {
  if (!err) return '알 수 없는 오류가 발생했습니다.';
  if (err.isConfigMissing) {
    return 'Supabase 연결 정보가 설정되지 않았습니다. public/js/supabase-client.js를 확인해 주세요.';
  }

  console.error('Supabase 요청 실패:', err);
  const message = String(err.message || err);

  if (err.name === 'TypeError' && /fetch/i.test(message)) {
    return '네트워크 연결에 실패했습니다. 인터넷 연결 상태를 확인하고 다시 시도해 주세요.';
  }
  if (/Invalid login credentials/i.test(message)) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (/JWT|token is expired|invalid claim|not authenticated/i.test(message)) {
    return '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.';
  }
  if (err.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return '저장 권한이 없습니다. 관리자 계정으로 다시 로그인해 주세요.';
  }
  if (err.code === '23505' || /duplicate key|already exists/i.test(message)) {
    return '이미 등록된 값입니다. 다른 값을 입력해 주세요.';
  }
  if (err.code === '23514' || /violates check constraint/i.test(message)) {
    return '입력값이 조건에 맞지 않습니다. 제목·설명 길이나 연도를 확인해 주세요.';
  }
  if (/NetworkError|Failed to fetch/i.test(message)) {
    return '네트워크 연결 오류가 발생했습니다. 인터넷 연결을 확인해 주세요.';
  }
  return '요청을 처리하지 못했습니다: ' + message;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE_LABEL = '10MB';

// Throws a specific message for unsupported types / oversized files —
// called before any upload is attempted.
function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP 파일만 업로드할 수 있습니다.');
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('이미지 용량이 너무 큽니다. ' + MAX_IMAGE_SIZE_LABEL + ' 이하의 파일만 업로드할 수 있습니다.');
  }
}

// Builds a collision-proof, cache-busting Storage path:
// <folder>/<YYYYMMDD-HHMMSS>-<uuid>.<ext>
function buildStoragePath(folder, file) {
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
  const ext = (extMatch ? extMatch[1] : 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
    '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
  return folder + '/' + stamp + '-' + crypto.randomUUID() + '.' + ext;
}

// Shared fetch for public content (activities/specialties/interests/settings).
// Queries Supabase directly — no backend server involved. Called fresh on
// every page load/refresh; no realtime subscription (not needed for a
// portfolio site that just needs "latest on refresh").
// Used by index.html, records.html, about.html.
async function fetchSiteContent() {
  assertSupabaseConfigured();

  const [activitiesRes, specialtiesRes, interestsRes, settingsRes] = await Promise.all([
    supabaseClient.from('activities').select('*').order('sort_order', { ascending: true }),
    supabaseClient.from('specialties').select('*').order('sort_order', { ascending: true }),
    supabaseClient.from('interests').select('*').order('sort_order', { ascending: true }),
    supabaseClient.from('settings').select('*')
  ]);

  const firstError = activitiesRes.error || specialtiesRes.error || interestsRes.error || settingsRes.error;
  if (firstError) throw new Error(describeSupabaseError(firstError));

  const settings = {};
  (settingsRes.data || []).forEach((row) => { settings[row.key] = row.value; });

  return {
    activities: activitiesRes.data || [],
    specialties: specialtiesRes.data || [],
    interests: interestsRes.data || [],
    settings,
    settingsRows: settingsRes.data || []
  };
}

function escHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function imgFrameHtml(imageUrl, alt, placeholderText) {
  if (imageUrl) {
    return '<img src="' + escHtml(imageUrl) + '" alt="' + escHtml(alt) + '">';
  }
  return '<div class="img-placeholder" style="display:flex">' + escHtml(placeholderText) + '</div>';
}

// Overrides a static local <img> (hero photo, about portrait) with a live
// URL from settings, if one has been uploaded through the admin page.
function applyRemoteImage(imgId, url) {
  if (!url) return;
  const img = document.getElementById(imgId);
  if (!img) return;
  img.src = url;
  img.style.display = 'block';
  const placeholder = img.nextElementSibling;
  if (placeholder && placeholder.classList.contains('img-placeholder')) placeholder.style.display = 'none';
}

// ── Editable site copy (admin.html "사이트 문구 관리" ↔ settings table) ──
//
// Every key below is stored as a plain row in the existing `settings` table
// (key/value, same table the hero/profile photo URLs already use — no schema
// change). SITE_COPY_DEFAULTS is what each page shipped with; getSiteCopy()
// falls back to that default whenever a key hasn't been saved yet, so a
// brand-new site (or a row nobody has touched) looks exactly like it did
// before this feature existed.
const SITE_COPY_DEFAULTS = {
  home_hero_title: '기록한 교육활동이 새로운 수업과 성장으로 이어지는 공간',
  home_hero_description: '교실에서 실천한 수업, 연수와 자료 개발의 과정을 차곡차곡 기록합니다. 기록은 다음 수업의 가장 좋은 재료가 됩니다.',
  home_records_button_label: '활동기록 보기 →',
  home_about_button_label: '진진쌤 소개',
  records_page_title: '활동기록',
  records_page_description: '연도와 활동 분야로 기록을 골라 볼 수 있습니다.',
  about_page_title: '수업을 기록하고,\n기록에서 다시 배웁니다.',
  about_intro_text:
    '안녕하세요, 초등학교에서 아이들과 함께 배우고 성장하는 진진쌤입니다. AI·SW교육과 과학·융합교육을 중심으로 프로젝트형 수업을 실천하고, 그 과정을 꾸준히 기록해 왔습니다. 이 공간은 그 기록들이 모여 다음 수업의 밑거름이 되는 아카이브입니다.\n\n교실에서 검증한 사례를 동료 선생님들과 나누는 연수와 교육자료 개발에도 참여하고 있습니다. 함께 나누고 싶은 이야기가 있다면 언제든 연락 주세요.',
  contact_heading: '함께 나눌 이야기가 있나요?',
  contact_email: 'sinjhon0105@naver.com',
  contact_email_subject: '진진쌤 문의',
  footer_slogan: '성장을 기록합니다.'
};

// Treats a missing row AND a blank/whitespace-only saved value the same way
// (falls back to the shipped default) so an admin can never save a field
// into an empty, broken-looking state.
function getSiteCopy(settings, key) {
  const value = settings && settings[key];
  return (typeof value === 'string' && value.trim()) ? value : SITE_COPY_DEFAULTS[key];
}

function buildGmailComposeUrl(email, subject) {
  return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(email) + '&su=' + encodeURIComponent(subject);
}

// Copy that appears on every public page (footer slogan/email) or only on
// the home page (CTA heading + mail link) — called once per page after
// fetchSiteContent() resolves. Guards every lookup so pages that don't have
// a given element (e.g. the CTA only exists on index.html) are unaffected.
// Returns the resolved contact email so callers (e.g. the copy-to-clipboard
// button on the home page) can reuse it without a second settings lookup.
function applyGlobalSiteCopy(settings) {
  const slogan = getSiteCopy(settings, 'footer_slogan');
  document.querySelectorAll('.footer-tagline').forEach((el) => { el.textContent = slogan; });

  const email = getSiteCopy(settings, 'contact_email');
  document.querySelectorAll('.footer-email').forEach((el) => { el.textContent = email; });

  const aboutEmailRow = document.getElementById('about-contact-email');
  if (aboutEmailRow) aboutEmailRow.textContent = email;

  const ctaHeading = document.querySelector('.cta h2');
  if (ctaHeading) ctaHeading.textContent = getSiteCopy(settings, 'contact_heading');

  const mailLink = document.querySelector('.cta-actions a');
  if (mailLink) {
    mailLink.href = buildGmailComposeUrl(email, getSiteCopy(settings, 'contact_email_subject'));
  }

  return email;
}
