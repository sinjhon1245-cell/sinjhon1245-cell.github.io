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
