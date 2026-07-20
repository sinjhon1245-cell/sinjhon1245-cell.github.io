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

// ── Client-side image prep (validate → decode → optimize) ──
//
// Shared by every way an admin can supply an activity photo (file picker,
// drag-drop, clipboard paste) so they all get identical validation and
// output, with no duplicated logic per input method.

const IMAGE_MIN_DIMENSION = 400; // below this a card photo will look soft when displayed — worth a warning, not a hard block
const IMAGE_MAX_DIMENSION = 2000; // longest side; never upscales past the source

// Decodes the file to confirm it's a real, undamaged image (a wrong/corrupt
// MIME type alone wouldn't catch a truncated or non-image file named *.jpg),
// then hands off to optimizeImageBitmap for resizing/re-encoding. Always
// closes the ImageBitmap it opens, and falls back to the original file if
// optimization itself fails for any reason — a failed optimization should
// never block the upload outright when the source file is otherwise valid.
async function prepareImageForUpload(file) {
  validateImageFile(file);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    throw new Error('이미지를 불러올 수 없습니다. 다른 파일을 선택해 주세요.');
  }
  if (!bitmap.width || !bitmap.height) {
    if (bitmap.close) bitmap.close();
    throw new Error('이미지를 불러올 수 없습니다. 다른 파일을 선택해 주세요.');
  }

  const tooSmall = bitmap.width < IMAGE_MIN_DIMENSION || bitmap.height < IMAGE_MIN_DIMENSION;

  let result;
  try {
    result = await optimizeImageBitmap(bitmap, file);
  } catch (err) {
    result = { file, width: bitmap.width, height: bitmap.height };
  } finally {
    if (bitmap.close) bitmap.close();
  }

  return { file: result.file, width: result.width, height: result.height, tooSmall };
}

// Resizes to a max 2000px longest side (never upscaling) and re-encodes:
// PNG stays PNG (lossless — keeps transparency, and keeps small screen-capture
// text crisp instead of blurring it under lossy compression); JPEG/WEBP
// sources become WEBP at quality 0.88, in the 0.85–0.9 range that keeps fine
// detail legible rather than chasing minimum file size. Skips the canvas
// round-trip entirely when there's nothing to change.
async function optimizeImageBitmap(bitmap, originalFile) {
  const longestSide = Math.max(bitmap.width, bitmap.height);
  const scale = longestSide > IMAGE_MAX_DIMENSION ? IMAGE_MAX_DIMENSION / longestSide : 1;
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

  const isPng = originalFile.type === 'image/png';
  const outputType = isPng ? 'image/png' : 'image/webp';
  const outputExt = isPng ? 'png' : 'webp';
  const quality = isPng ? undefined : 0.88;

  if (scale === 1 && originalFile.type === outputType) {
    return { file: originalFile, width: bitmap.width, height: bitmap.height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, outputType, quality));
  if (!blob) throw new Error('canvas encode failed');

  const baseName = (originalFile.name || 'image').replace(/\.[a-zA-Z0-9]+$/, '');
  return {
    file: new File([blob], baseName + '.' + outputExt, { type: outputType }),
    width: targetWidth,
    height: targetHeight
  };
}

// Shared fetch for public content (activities/specialties/interests/settings).
// Queries Supabase directly — no backend server involved. Called fresh on
// every page load/refresh; no realtime subscription (not needed for a
// portfolio site that just needs "latest on refresh").
// Used by index.html, records.html, about.html.
async function fetchSiteContent() {
  assertSupabaseConfigured();

  // careers is queried in the same Promise.all for efficiency, but its error
  // is deliberately kept OUT of firstError below: the careers table is new
  // and its SQL patch may not have been run yet on a given project, and a
  // missing-table error there must never take down activities/specialties/
  // interests/settings (which is why it's checked separately, not thrown).
  const [activitiesRes, specialtiesRes, interestsRes, settingsRes, careersRes] = await Promise.all([
    // Newest-first: year desc, then created_at desc (latest-registered
    // activity in a year leads), then id desc as a final tiebreaker. This
    // runs before any pagination/filtering downstream (records.js), so a
    // freshly added activity always lands on page 1 instead of wherever its
    // old sort_order-based position happened to fall.
    supabaseClient.from('activities').select('*')
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
    supabaseClient.from('specialties').select('*').order('sort_order', { ascending: true }),
    supabaseClient.from('interests').select('*').order('sort_order', { ascending: true }),
    supabaseClient.from('settings').select('*'),
    supabaseClient.from('careers').select('*').order('is_current', { ascending: false }).order('start_year', { ascending: false }).order('created_at', { ascending: false })
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
    settingsRows: settingsRes.data || [],
    careers: careersRes.data || [],
    careersError: careersRes.error || null
  };
}

// "2024 – 현재" / "2022 – 2024" / "2023" — built from start_year/end_year/
// is_current at render time so the finished sentence is never stored in the
// database (admins only ever edit the three underlying fields). Uses an en
// dash (–) with a space on both sides; a single-year career (end_year equal
// to start_year, or no end_year) shows the year once instead of "2024 – 2024".
function formatCareerPeriod(career) {
  if (career.is_current) {
    return career.start_year + ' – 현재';
  }

  if (
    career.end_year != null &&
    career.end_year !== career.start_year
  ) {
    return career.start_year + ' – ' + career.end_year;
  }

  return String(career.start_year);
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

// ── Activity default thumbnails (public/images/activity-default) ──
//
// Shown only when an activity has no real photo. Matched purely by an exact
// activity.field match — never by title keyword or partial/fuzzy matching —
// so the mapping stays a single, predictable lookup that can't silently
// mismatch a photo to the wrong activity. A field with no exact entry here
// (or that doesn't match one of the six official field names at all) simply
// renders no <img>, and .img-frame's own background color shows through as
// the plain common fallback.
//
// ACTIVITY_DEFAULT_IMAGE_VERSION is the single place to bump when a default
// thumbnail file is replaced under the same filename, so GitHub Pages/
// browser caches pick up the new file instead of serving the old one.
const ACTIVITY_DEFAULT_IMAGE_VERSION = '20260720';
const ACTIVITY_DEFAULT_IMAGE_BASE = 'public/images/activity-default/';

const ACTIVITY_DEFAULT_IMAGES = {
  'AI·SW교육': 'activity-ai-sw.png',
  '과학·융합교육': 'activity-science.png',
  '프로젝트형 수업': 'activity-project.png',
  '디지털 기반 수업혁신': 'activity-digital.png',
  '교사 연수': 'activity-training.png',
  '교육자료 개발': 'activity-materials.png'
};

// Trims the field first so stray whitespace never breaks an otherwise-exact
// match, but never does substring/fuzzy matching beyond that.
function getActivityDefaultImage(field) {
  const trimmed = (field || '').trim();
  const file = ACTIVITY_DEFAULT_IMAGES[trimmed];
  return file ? ACTIVITY_DEFAULT_IMAGE_BASE + file + '?v=' + ACTIVITY_DEFAULT_IMAGE_VERSION : null;
}

// Resolution order, called once per activity when rendering a card:
//   1. activity.image_url — a real photo uploaded through admin.html (null,
//      empty, or whitespace-only all count as "no photo")
//   2. a field-matched default thumbnail (getActivityDefaultImage)
//   3. null — caller renders no <img>; the frame's own CSS background shows
function resolveActivityImage(activity) {
  const url = (activity.image_url || '').trim();
  if (url) return { type: 'real', url: activity.image_url };

  const defaultUrl = getActivityDefaultImage(activity.field);
  if (defaultUrl) return { type: 'default', url: defaultUrl };

  return null;
}

// Shared onerror= handler for every activity <img> (real photo or default
// thumbnail alike) across records/home/admin — a broken real photo (deleted
// Storage file, bad URL, decode failure, network error) swaps to the
// activity's field default exactly once; if that default also fails to
// load, the element is dropped entirely so the frame's plain CSS background
// shows, rather than looping or leaving a broken-image icon on screen.
// Reads the field from data-field (set by the caller) instead of taking it
// as a parameter, since this is wired up as a plain inline onerror="" string.
function handleActivityImageError(img) {
  img.onerror = null;
  const fallback = getActivityDefaultImage(img.dataset.field);
  if (!fallback) {
    img.remove();
    return;
  }
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.removeAttribute('srcset');
  img.onerror = function () {
    img.onerror = null;
    img.remove();
  };
  img.src = fallback;
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
