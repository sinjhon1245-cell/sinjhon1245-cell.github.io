// 진진쌤 사이트 — 관리자 콘텐츠 관리 도구
//
// GitHub Pages(정적 호스팅) + Supabase 구성 — 별도 백엔드 서버가 없습니다.
// 로그인은 Supabase Auth(이메일/비밀번호)가 처리하지만, 로그인했다고 바로 관리자가
// 되는 것은 아닙니다 — 로그인 직후(그리고 페이지를 새로 열 때마다) is_admin() RPC로
// "admins 테이블에 등록된 사용자인지"를 다시 확인하고, 아니면 즉시 로그아웃시킵니다.
// 실제 쓰기 권한도 schema.sql의 RLS 정책이 같은 기준으로 서버 쪽에서 강제합니다 —
// 이 파일의 검사는 UX를 위한 것이고, 진짜 보안은 전부 Supabase 쪽 RLS가 담당합니다.
//
// 사진은 Supabase Storage 'photos' 버킷에 폴더별(activities/hero/profile) + 고유
// 파일명으로 올라가고, 교체 시 "새 파일 업로드 → DB 반영 성공 확인 → 기존 파일 삭제"
// 순서를 지켜서 실패해도 콘텐츠가 깨지지 않도록 합니다.

const gate = document.getElementById('gate');
const shell = document.getElementById('admin-shell');
const adminLoadError = document.getElementById('admin-load-error');

const PAGES = {
  home: { href: 'index.html', label: '홈' },
  records: { href: 'records.html', label: '활동기록' },
  about: { href: 'about.html', label: '소개' }
};

function renderSuccessActions(containerId, pages) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = pages.map((p) =>
    `<a href="${escHtml(p.href)}">${escHtml(p.label)} 바로가기</a>` +
    `<a href="${escHtml(p.href)}" target="_blank" rel="noopener noreferrer">${escHtml(p.label)} 새 창 미리보기</a>`
  ).join('');
}

function clearSuccessActions(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

// ── 사이트 문구 관리 (settings 테이블에 key/value로 저장, 스키마 변경 없음) ──

// 'title' fields cap at 150 chars, 'description' fields at 2000, matching the
// site-wide validation rule; 'email' gets a basic format check instead.
const COPY_FIELD_TYPES = {
  home_hero_title: 'title',
  home_hero_description: 'description',
  home_records_button_label: 'title',
  home_about_button_label: 'title',
  records_page_title: 'title',
  records_page_description: 'description',
  about_page_title: 'title',
  about_intro_text: 'description',
  contact_heading: 'title',
  contact_email: 'email',
  contact_email_subject: 'title',
  footer_slogan: 'title'
};

const COPY_GROUPS = [
  {
    formId: 'copy-home-form', messageId: 'copy-home-message', actionsId: 'copy-home-actions',
    pages: [PAGES.home],
    fields: [
      { key: 'home_hero_title', label: '히어로 제목' },
      { key: 'home_hero_description', label: '히어로 설명' },
      { key: 'home_records_button_label', label: '"활동기록 보기" 버튼 문구' },
      { key: 'home_about_button_label', label: '"소개" 버튼 문구' }
    ]
  },
  {
    formId: 'copy-records-form', messageId: 'copy-records-message', actionsId: 'copy-records-actions',
    pages: [PAGES.records],
    fields: [
      { key: 'records_page_title', label: '페이지 제목' },
      { key: 'records_page_description', label: '페이지 설명' }
    ]
  },
  {
    formId: 'copy-about-form', messageId: 'copy-about-message', actionsId: 'copy-about-actions',
    pages: [PAGES.about],
    fields: [
      { key: 'about_page_title', label: '페이지 제목' },
      { key: 'about_intro_text', label: '소개 본문' }
    ]
  },
  {
    formId: 'copy-contact-form', messageId: 'copy-contact-message', actionsId: 'copy-contact-actions',
    pages: [PAGES.home, PAGES.about],
    fields: [
      { key: 'contact_heading', label: '문의 영역 제목' },
      { key: 'contact_email', label: '받는 이메일 주소' },
      { key: 'contact_email_subject', label: '메일 제목' }
    ]
  }
];

function validateCopyValue(key, label, rawValue) {
  const value = (rawValue || '').trim();
  if (!value) throw new Error(label + '을(를) 입력해 주세요.');

  const type = COPY_FIELD_TYPES[key];
  if (type === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error('올바른 이메일 주소를 입력해 주세요.');
    }
  } else if (type === 'description') {
    if (value.length > 2000) throw new Error(label + '은(는) 2000자 이내로 입력해 주세요.');
  } else {
    if (value.length > 150) throw new Error(label + '은(는) 150자 이내로 입력해 주세요.');
  }
  return value;
}

// Fills each field with its saved value, or the shipped default when nothing
// has been saved yet (getSiteCopy, from site-data.js) — called from loadAll()
// so the forms always reflect the latest settings after any save.
function populateCopyForm(formId, fields, settings) {
  const form = document.getElementById(formId);
  if (!form) return;
  fields.forEach(({ key }) => {
    if (form.elements[key]) form.elements[key].value = getSiteCopy(settings, key);
  });
}

function setupCopyForm({ formId, fields, messageId, actionsId, pages }) {
  const form = document.getElementById(formId);
  const message = document.getElementById(messageId);
  let isSubmitting = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중…';
    message.textContent = '';
    message.className = 'form-message';
    clearSuccessActions(actionsId);

    try {
      const fd = new FormData(form);
      const rows = fields.map(({ key, label }) => ({
        key, value: validateCopyValue(key, label, fd.get(key))
      }));

      const { error } = await supabaseClient.from('settings').upsert(rows, { onConflict: 'key' });
      if (error) throw new Error(describeSupabaseError(error));

      message.textContent = '저장되었습니다.';
      message.className = 'form-message success';
      renderSuccessActions(actionsId, pages);
      await loadAll();
    } catch (err) {
      message.textContent = err.message || describeSupabaseError(err);
      message.className = 'form-message error';
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}

// ── Login gate (Supabase Auth + admins-table check) ──

async function isCurrentUserAdmin() {
  try {
    const { data, error } = await supabaseClient.rpc('is_admin');
    if (error) {
      console.error('관리자 확인 요청 실패:', error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error('관리자 확인 요청 실패:', err);
    return false;
  }
}

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return false;
  return isCurrentUserAdmin();
}

function showShell() {
  gate.style.display = 'none';
  shell.style.display = 'block';
  loadAll();
}

function showGate() {
  shell.style.display = 'none';
  gate.style.display = 'flex';
}

function resetAllForms() {
  exitActivityEditMode();
  exitSpecialtyEditMode();
  exitInterestEditMode();
  exitCareerEditMode();
  ['activity-form-actions', 'specialty-form-actions', 'interest-form-actions', 'career-form-actions', 'hero-photo-actions', 'about-photo-actions']
    .forEach(clearSuccessActions);
  ['activity-form-message', 'specialty-form-message', 'interest-form-message', 'career-form-message', 'hero-photo-message', 'about-photo-message']
    .forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = ''; });
  currentData = { activities: [], specialties: [], interests: [], settings: {}, settingsRows: [], careers: [], careersError: null };
}

function setupGate() {
  const emailInput = document.getElementById('gate-email');
  const passwordInput = document.getElementById('gate-input');
  const button = document.getElementById('gate-submit');
  const error = document.getElementById('gate-error');
  let isSubmitting = false;

  async function tryLogin() {
    if (isSubmitting) return;
    if (!SUPABASE_CONFIGURED) {
      error.textContent = 'Supabase 연결 정보가 설정되지 않았습니다. public/js/supabase-client.js를 확인해 주세요.';
      return;
    }
    isSubmitting = true;
    button.disabled = true;
    button.textContent = '로그인 중…';
    error.textContent = '';

    // Wrapped in try/catch/finally so ANY failure — a Supabase auth error, a
    // network problem, or an unexpected bug — always ends with a visible
    // message and a re-enabled button, instead of leaving the UI stuck with
    // no feedback (an uncaught error here previously just froze the button).
    try {
      const { error: authError } = await supabaseClient.auth.signInWithPassword({
        email: emailInput.value.trim(),
        password: passwordInput.value
      });

      if (authError) {
        error.textContent = describeSupabaseError(authError);
        return;
      }

      const isAdmin = await isCurrentUserAdmin();
      if (!isAdmin) {
        await supabaseClient.auth.signOut();
        error.textContent = '관리자 권한이 없는 계정입니다. 지정된 관리자 계정으로 로그인해 주세요.';
        return;
      }

      passwordInput.value = '';
      showShell();
    } catch (err) {
      error.textContent = describeSupabaseError(err);
    } finally {
      button.disabled = false;
      button.textContent = '로그인';
      isSubmitting = false;
    }
  }

  button.addEventListener('click', tryLogin);
  [emailInput, passwordInput].forEach((input) => {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    resetAllForms();
    showGate();
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      resetAllForms();
      showGate();
    }
  });
}

// ── Supabase Storage: upload / safe delete ──

async function uploadToStorage(file, folder) {
  validateImageFile(file);
  const path = buildStoragePath(folder, file);
  const { error } = await supabaseClient.storage.from('photos').upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw new Error(describeSupabaseError(error));
  const { data } = supabaseClient.storage.from('photos').getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// Best-effort delete — never throws, since a cleanup failure shouldn't block
// the operation that already succeeded (or abort a whole "delete activity").
async function safeRemoveStoragePath(path) {
  if (!path) return;
  const { error } = await supabaseClient.storage.from('photos').remove([path]);
  if (error) console.error('Storage 파일 삭제 실패(무시하고 계속):', error.message);
}

function isImagePathStillReferenced(path, excludeActivityId) {
  const usedByActivity = currentData.activities.some((a) =>
    a.image_path === path && String(a.id) !== String(excludeActivityId)
  );
  const usedBySetting = currentData.settingsRows.some((s) => s.path === path);
  return usedByActivity || usedBySetting;
}

// ── Rendering + wiring per collection ──

let currentData = { activities: [], specialties: [], interests: [], settings: {}, settingsRows: [], careers: [], careersError: null };

// The small list thumbnail follows the exact same real-photo → field-default
// → nothing priority as the public cards (resolveActivityImage, site-data.js),
// so a photo-less activity shows its field's default thumbnail here too
// instead of the old empty beige square. The thumb is decorative in this
// admin list (alt=""), and data-field lets a broken real photo fall back to
// the field default via the shared onerror handler.
function activityThumbHtml(a) {
  const imageResult = resolveActivityImage(a);
  if (imageResult) {
    return `<img class="mgmt-row-thumb" src="${escHtml(imageResult.url)}" alt="" aria-hidden="true" data-field="${escHtml(a.field)}" onerror="handleActivityImageError(this)">`;
  }
  return `<div class="mgmt-row-thumb-placeholder"></div>`;
}

// One activity row inside a year group. The left side carries the reorder
// affordances (drag handle + up/down/top buttons); the right side keeps the
// existing 수정 / 삭제 actions. data-year lets the drag logic keep a row from
// ever crossing into another year's group.
function activityOrderRowHtml(a) {
  const thumb = activityThumbHtml(a);
  const badge = a.featured ? '<span class="mgmt-row-badge">대표 활동</span>' : '';
  return `
    <div class="mgmt-row activity-row" data-id="${escHtml(a.id)}" data-year="${escHtml(a.year)}">
      <button type="button" class="mgmt-row-handle" aria-label="드래그하여 순서 변경" title="드래그하여 순서 변경">⋮⋮</button>
      <div class="mgmt-row-move">
        <button type="button" class="mgmt-move-btn mgmt-move-up" aria-label="위로 이동">▲</button>
        <button type="button" class="mgmt-move-btn mgmt-move-down" aria-label="아래로 이동">▼</button>
        <button type="button" class="mgmt-move-btn mgmt-move-top" aria-label="맨 위로 이동">⤒</button>
      </div>
      ${thumb}
      <div class="mgmt-row-body">
        <span class="mgmt-row-title">${escHtml(a.title)}</span>
        <span class="mgmt-row-meta">${escHtml(a.year)} · ${escHtml(a.field)} · ${escHtml(a.role)} · ${escHtml(a.type)}</span>
      </div>
      ${badge}
      <div class="mgmt-row-actions">
        <button class="mgmt-row-edit" type="button" data-table="activities" data-id="${escHtml(a.id)}">수정</button>
        <button class="mgmt-row-delete" type="button" data-table="activities" data-id="${escHtml(a.id)}">삭제</button>
      </div>
    </div>`;
}

// ── Activity list: per-year groups + in-year ordering ──
//
// Snapshot of each year's saved (server) id order, captured every render, so
// isYearDirty() can tell when the on-screen order has drifted from it. Keyed
// by year string.
let activityOrderBaseline = {};

// Renders #activities-list grouped by year (newest first), each group in the
// same canonical order as the public page (sortActivitiesForDisplay). Replaces
// the generic renderList for activities so it can add the year headings and
// per-row ordering controls.
function renderActivitiesList() {
  const el = document.getElementById('activities-list');
  if (!el) return;
  activityOrderBaseline = {};

  const activities = currentData.activities || [];
  if (!activities.length) {
    el.innerHTML = `<p class="mgmt-empty">아직 등록된 활동이 없습니다.</p>`;
    return;
  }

  const sorted = sortActivitiesForDisplay(activities);
  const order = [];
  const byYear = new Map();
  sorted.forEach((a) => {
    const y = Number(a.year) || 0;
    if (!byYear.has(y)) { byYear.set(y, []); order.push(y); }
    byYear.get(y).push(a);
  });

  el.innerHTML = order.map((y) => {
    const items = byYear.get(y);
    activityOrderBaseline[String(y)] = items.map((a) => String(a.id));
    const rows = items.map(activityOrderRowHtml).join('');
    return `
      <div class="mgmt-year-group" data-year="${escHtml(y)}">
        <div class="mgmt-year-head">
          <span class="mgmt-year-label">${escHtml(y)}년 · ${items.length}건</span>
          <div class="mgmt-year-order-actions" data-year="${escHtml(y)}" hidden>
            <span class="mgmt-order-dirty">저장되지 않은 순서 변경</span>
            <button type="button" class="mgmt-order-restore" data-year="${escHtml(y)}" hidden>서버 순서로 되돌리기</button>
            <button type="button" class="mgmt-order-save" data-year="${escHtml(y)}">순서 저장</button>
          </div>
        </div>
        <div class="mgmt-year-rows" data-year="${escHtml(y)}">${rows}</div>
      </div>`;
  }).join('');

  wireActivityOrderControls();
  order.forEach((y) => updateMoveButtonStates(String(y)));
}

function yearRowsContainer(year) {
  return document.querySelector('.mgmt-year-rows[data-year="' + year + '"]');
}

function currentYearOrder(year) {
  const container = yearRowsContainer(year);
  if (!container) return [];
  return Array.from(container.querySelectorAll('.activity-row')).map((r) => r.dataset.id);
}

function isYearDirty(year) {
  const base = activityOrderBaseline[year] || [];
  const cur = currentYearOrder(year);
  if (base.length !== cur.length) return true;
  return base.some((id, i) => id !== cur[i]);
}

// First/last row can't move further, so their up/top / down buttons disable.
function updateMoveButtonStates(year) {
  const container = yearRowsContainer(year);
  if (!container) return;
  const rows = Array.from(container.querySelectorAll('.activity-row'));
  rows.forEach((row, i) => {
    const up = row.querySelector('.mgmt-move-up');
    const top = row.querySelector('.mgmt-move-top');
    const down = row.querySelector('.mgmt-move-down');
    if (up) up.disabled = (i === 0);
    if (top) top.disabled = (i === 0);
    if (down) down.disabled = (i === rows.length - 1);
  });
}

// Shows/hides the "저장되지 않은 순서 변경" indicator + 순서 저장 button for a year.
function refreshYearDirty(year) {
  const actions = document.querySelector('.mgmt-year-order-actions[data-year="' + year + '"]');
  if (actions) actions.hidden = !isYearDirty(year);
}

function afterReorder(year) {
  updateMoveButtonStates(year);
  refreshYearDirty(year);
}

function moveActivityRow(row, direction) {
  const container = row.parentNode;
  if (direction === 'up') {
    const prev = row.previousElementSibling;
    if (prev) container.insertBefore(row, prev);
  } else if (direction === 'down') {
    const next = row.nextElementSibling;
    if (next) container.insertBefore(next, row);
  } else if (direction === 'top') {
    container.insertBefore(row, container.firstElementChild);
  }
}

// Native HTML5 drag, scoped to a single year group. The whole card is NOT
// draggable — only pressing the ⋮⋮ handle arms `draggable`, and a dragover is
// ignored (no preventDefault → no drop) unless the target row is in the same
// year as the row being dragged, so a row can never leave its year.
let draggingRow = null;
let draggingYear = null;

function wireRowDrag(row) {
  const handle = row.querySelector('.mgmt-row-handle');
  if (!handle) return;

  handle.addEventListener('mousedown', () => { row.setAttribute('draggable', 'true'); });
  handle.addEventListener('mouseup', () => { row.removeAttribute('draggable'); });

  row.addEventListener('dragstart', (e) => {
    draggingRow = row;
    draggingYear = row.dataset.year;
    row.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', row.dataset.id); } catch (_) {}
    }
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    row.removeAttribute('draggable');
    const year = draggingYear;
    draggingRow = null;
    draggingYear = null;
    if (year != null) afterReorder(year);
  });

  row.addEventListener('dragover', (e) => {
    if (!draggingRow || draggingRow === row) return;
    if (row.dataset.year !== draggingYear) return; // stay inside the year group
    e.preventDefault();
    const rect = row.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    const container = row.parentNode;
    if (after) {
      container.insertBefore(draggingRow, row.nextElementSibling);
    } else {
      container.insertBefore(draggingRow, row);
    }
  });
}

function wireActivityOrderControls() {
  document.querySelectorAll('#activities-list .activity-row').forEach((row) => {
    const year = row.dataset.year;
    const up = row.querySelector('.mgmt-move-up');
    const down = row.querySelector('.mgmt-move-down');
    const top = row.querySelector('.mgmt-move-top');
    if (up) up.addEventListener('click', () => { moveActivityRow(row, 'up'); afterReorder(year); });
    if (down) down.addEventListener('click', () => { moveActivityRow(row, 'down'); afterReorder(year); });
    if (top) top.addEventListener('click', () => { moveActivityRow(row, 'top'); afterReorder(year); });
    wireRowDrag(row);
  });

  document.querySelectorAll('#activities-list .mgmt-order-save').forEach((btn) => {
    btn.addEventListener('click', () => saveYearOrder(btn.dataset.year, btn));
  });
  document.querySelectorAll('#activities-list .mgmt-order-restore').forEach((btn) => {
    // Restore = just reload the server state, discarding the unsaved reorder.
    btn.addEventListener('click', () => loadAll());
  });
}

// Persists one year group's order. Normalizes to an even 10-step spacing in
// the current on-screen order and writes only this year's rows (only the
// sort_order column — never any other field). A success message shows ONLY
// when every row's update succeeded; on any failure the group stays dirty for
// a retry and a "서버 순서로 되돌리기" button appears.
let isSavingYearOrder = false;
async function saveYearOrder(year, btn) {
  if (btn.disabled || isSavingYearOrder) return;
  const ids = currentYearOrder(year);
  if (!ids.length) return;

  const message = document.getElementById('activity-form-message');
  const restoreBtn = document.querySelector('.mgmt-order-restore[data-year="' + year + '"]');

  isSavingYearOrder = true;
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = '저장 중…';
  if (restoreBtn) restoreBtn.hidden = true;
  if (message) { message.textContent = ''; message.className = 'form-message'; }

  const updates = ids.map((id, i) => ({ id, sort_order: (i + 1) * 10 }));

  try {
    const results = await Promise.all(
      updates.map((u) =>
        supabaseClient.from('activities').update({ sort_order: u.sort_order }).eq('id', u.id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed) throw new Error(describeSupabaseError(failed.error));

    if (message) {
      message.textContent = year + '년 활동 순서가 저장되었습니다.';
      message.className = 'form-message success';
    }
    await loadAll(); // reload → baseline reset, dirty indicator clears
  } catch (err) {
    btn.disabled = false;
    btn.textContent = originalLabel;
    if (restoreBtn) restoreBtn.hidden = false;
    if (message) {
      message.textContent = (err.message || '순서 저장에 실패했습니다.') +
        ' 변경은 아직 저장되지 않았습니다. 다시 시도하거나 "서버 순서로 되돌리기"를 눌러 주세요.';
      message.className = 'form-message error';
    }
  } finally {
    isSavingYearOrder = false;
  }
}

function specialtyRowHtml(s) {
  return `
    <div class="mgmt-row" data-id="${escHtml(s.id)}">
      <div class="mgmt-row-body">
        <span class="mgmt-row-title">${escHtml(s.name)}</span>
        <span class="mgmt-row-meta">${escHtml(s.description)}</span>
      </div>
      <button class="mgmt-row-edit" type="button" data-table="specialties" data-id="${escHtml(s.id)}">수정</button>
      <button class="mgmt-row-delete" type="button" data-table="specialties" data-id="${escHtml(s.id)}">삭제</button>
    </div>`;
}

function interestRowHtml(i) {
  return `
    <div class="mgmt-row" data-id="${escHtml(i.id)}">
      <div class="mgmt-row-body">
        <span class="mgmt-row-title">${escHtml(i.label)}</span>
      </div>
      <button class="mgmt-row-edit" type="button" data-table="interests" data-id="${escHtml(i.id)}">수정</button>
      <button class="mgmt-row-delete" type="button" data-table="interests" data-id="${escHtml(i.id)}">삭제</button>
    </div>`;
}

function renderList(containerId, rows, rowHtmlFn, emptyText) {
  const el = document.getElementById(containerId);
  el.innerHTML = rows.length ? rows.map(rowHtmlFn).join('') : `<p class="mgmt-empty">${escHtml(emptyText)}</p>`;
}

function showPreview(imgId, url) {
  const img = document.getElementById(imgId);
  if (!img) return;
  const placeholder = img.nextElementSibling;
  if (url) {
    img.src = url;
    img.style.display = 'block';
    if (placeholder && placeholder.classList.contains('img-placeholder')) placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    if (placeholder && placeholder.classList.contains('img-placeholder')) placeholder.style.display = 'flex';
  }
}

async function loadAll() {
  adminLoadError.style.display = 'none';
  adminLoadError.textContent = '';
  try {
    currentData = await fetchSiteContent();
  } catch (err) {
    currentData = { activities: [], specialties: [], interests: [], settings: {}, settingsRows: [], careers: [], careersError: null };
    adminLoadError.textContent = describeSupabaseError(err);
    adminLoadError.style.display = 'block';
  }
  renderActivitiesList();
  renderList('specialties-list-admin', currentData.specialties, specialtyRowHtml, '아직 등록된 전문 분야가 없습니다.');
  renderList('interests-list-admin', currentData.interests, interestRowHtml, '아직 등록된 관심 주제가 없습니다.');
  if (currentData.careersError) {
    const careersListEl = document.getElementById('careers-list-admin');
    if (careersListEl) careersListEl.innerHTML = `<p class="mgmt-empty">${escHtml(describeSupabaseError(currentData.careersError))}</p>`;
  } else {
    renderList('careers-list-admin', currentData.careers, careerRowHtml, '아직 등록된 주요 이력이 없습니다.');
  }
  showPreview('hero-photo-preview', currentData.settings.hero_image_url);
  showPreview('about-photo-preview', currentData.settings.about_portrait_url);
  COPY_GROUPS.forEach((g) => populateCopyForm(g.formId, g.fields, currentData.settings));
  wireRowButtons();
}

function wireRowButtons() {
  document.querySelectorAll('.mgmt-row-delete').forEach((btn) => {
    let isDeleting = false;
    btn.addEventListener('click', async () => {
      if (isDeleting) return;
      if (!confirm('정말 삭제할까요? 되돌릴 수 없습니다.')) return;

      const table = btn.dataset.table;
      const id = btn.dataset.id;
      const row = currentData[table].find((r) => String(r.id) === String(id));

      isDeleting = true;
      btn.disabled = true;
      btn.textContent = '삭제 중…';

      const { error } = await supabaseClient.from(table).delete().eq('id', id);
      if (error) {
        alert(describeSupabaseError(error));
        btn.disabled = false;
        btn.textContent = '삭제';
        isDeleting = false;
        return;
      }

      if (table === 'activities' && row && row.image_path && !isImagePathStillReferenced(row.image_path, id)) {
        await safeRemoveStoragePath(row.image_path);
      }

      const labels = { activities: '활동 기록이', specialties: '전문 분야가', interests: '관심 주제가', careers: '주요 이력이' };
      const messageId = { activities: 'activity-form-message', specialties: 'specialty-form-message', interests: 'interest-form-message', careers: 'career-form-message' }[table];
      const messageEl = document.getElementById(messageId);
      if (messageEl) {
        messageEl.textContent = (labels[table] || '항목이') + ' 삭제되었습니다.';
        messageEl.className = 'form-message success';
      }

      await loadAll();
    });
  });

  document.querySelectorAll('.mgmt-row-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const table = btn.dataset.table;
      const id = btn.dataset.id;
      const row = currentData[table].find((r) => String(r.id) === String(id));
      if (!row) return;
      if (table === 'activities') enterActivityEditMode(row);
      if (table === 'specialties') enterSpecialtyEditMode(row);
      if (table === 'interests') enterInterestEditMode(row);
      if (table === 'careers') enterCareerEditMode(row);
    });
  });
}

function nextSortOrder(rows) {
  return rows.reduce((max, r) => Math.max(max, r.sort_order || 0), 0) + 1;
}

// sort_order for a brand-new activity so it lands at the TOP of its own year
// group (smaller sort_order = higher up, matching sortActivitiesForDisplay).
// Only this one year is consulted and only the new row is written — no other
// activity's sort_order is touched, so adding a 2026 activity never disturbs
// the 2025 order. An empty year starts at 0; otherwise we go 10 below the
// current minimum, leaving room without renumbering anything.
function firstSortOrderForYear(activities, year) {
  const sameYear = activities.filter((a) => Number(a.year) === Number(year));
  if (sameYear.length === 0) return 0;
  const min = sameYear.reduce(
    (m, a) => Math.min(m, a.sort_order == null ? 0 : Number(a.sort_order)),
    Infinity
  );
  return min - 10;
}

// ── 활동기록 form (add + edit) ──
//
// Activity photo UI: a quiet collapsed row (upload button + a small existing
// thumbnail when there is one) that expands into a panel only when asked
// for. Every input path (file picker, drag-drop, clipboard paste) funnels
// into the same handleIncomingActivityImage(), which is the one place that
// validates/optimizes a file and updates this shared state; the submit
// handler further below only ever reads from it (never from input.files or
// FormData for the photo itself), so there is exactly one source of truth
// regardless of how the image arrived or whether the panel is open.
let existingImageUrl = null;   // already-saved Storage URL (edit mode only)
let existingImagePath = null;  // already-saved Storage path (edit mode only)
let pendingImageFile = null;   // validated/optimized File — not yet uploaded
let removeExistingImage = false; // true = clear the existing photo on save
let previewObjectUrl = null;   // URL.createObjectURL(pendingImageFile), revoked on replace/clear
let pendingImageLabel = null;  // display name for the pending file ("화면 캡처 이미지" or its filename)
let pendingImageWidth = null;
let pendingImageHeight = null;

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(kb < 10 ? 1 : 0) + 'KB';
  const mb = kb / 1024;
  return mb.toFixed(mb < 10 ? 1 : 0) + 'MB';
}

function setActivityPhotoMessage(text, type) {
  const el = document.getElementById('activity-photo-message');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'form-message' + (type ? ' ' + type : '');
}

// Revokes the pending preview's object URL (if any) and clears the pending
// selection — called before accepting a new file (so previews never
// accumulate un-revoked URLs) and when the user cancels a pending selection
// or the form itself resets.
function clearPendingImage() {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  pendingImageFile = null;
  previewObjectUrl = null;
  pendingImageLabel = null;
  pendingImageWidth = null;
  pendingImageHeight = null;
}

function isActivityPhotoPanelExpanded() {
  const panel = document.getElementById('activity-photo-panel');
  return !!panel && panel.style.display !== 'none';
}

function setActivityPhotoPanelExpanded(expanded) {
  const panel = document.getElementById('activity-photo-panel');
  const toggle = document.getElementById('activity-photo-toggle');
  if (!panel || !toggle) return;
  panel.style.display = expanded ? 'flex' : 'none';
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (expanded) panel.focus(); // lets Ctrl+V paste work the instant it opens
}

// Collapsed row: only ever reflects the already-saved photo (a pending,
// not-yet-uploaded replacement never appears here — that lives entirely
// inside the panel's own preview state below).
function renderActivityPhotoCollapsed() {
  const mini = document.getElementById('activity-photo-existing-mini');
  const img = document.getElementById('activity-photo-existing-mini-img');
  if (!mini || !img) return;
  if (existingImageUrl && !removeExistingImage) {
    img.src = existingImageUrl;
    mini.style.display = 'flex';
  } else {
    mini.style.display = 'none';
  }
}

// Panel's internal hint-vs-preview state — independent of whether the panel
// itself is currently shown, so reopening it after a collapse always shows
// whatever is actually pending (or the intake hint, if nothing is).
function renderActivityPhotoPanel() {
  const hintState = document.getElementById('activity-photo-hint-state');
  const previewState = document.getElementById('activity-photo-preview');
  const img = document.getElementById('activity-photo-preview-img');
  const nameEl = document.getElementById('activity-photo-preview-name');
  const metaEl = document.getElementById('activity-photo-preview-meta');
  if (!hintState || !previewState) return;

  if (pendingImageFile) {
    img.src = previewObjectUrl;
    img.alt = '선택한 대표사진 미리보기';
    nameEl.textContent = pendingImageLabel || pendingImageFile.name;
    metaEl.textContent = formatFileSize(pendingImageFile.size) +
      (pendingImageWidth && pendingImageHeight ? ' · ' + pendingImageWidth + '×' + pendingImageHeight : '');
    previewState.style.display = 'flex';
    hintState.style.display = 'none';
  } else {
    previewState.style.display = 'none';
    hintState.style.display = 'flex';
  }
}

function renderActivityPhoto() {
  renderActivityPhotoCollapsed();
  renderActivityPhotoPanel();
}

// The one shared entry point for every input method — file picker, drop,
// and paste all call this with the raw File they received. Validates,
// decodes, and optimizes it (prepareImageForUpload, site-data.js), then
// updates the shared pending-image state and re-renders. Never touches
// Storage — upload only happens when the activity form is saved.
async function handleIncomingActivityImage(file, opts) {
  opts = opts || {};
  // A caller (processIncomingActivityFiles) may have already set a "one
  // photo only" warning just before calling this — only clear that out if
  // we're not about to replace it with something equally or more relevant
  // below (a decode error, or a too-small warning about the file we
  // actually kept).
  if (!opts.keepMessage) setActivityPhotoMessage('', '');
  try {
    const prepared = await prepareImageForUpload(file);
    clearPendingImage();
    pendingImageFile = prepared.file;
    previewObjectUrl = URL.createObjectURL(prepared.file);
    pendingImageLabel = opts.label || file.name;
    pendingImageWidth = prepared.width;
    pendingImageHeight = prepared.height;
    renderActivityPhotoPanel();
    if (prepared.tooSmall) {
      setActivityPhotoMessage('이미지 크기가 작아 화질이 흐릿하게 보일 수 있습니다.', 'warning');
    }
  } catch (err) {
    setActivityPhotoMessage(err.message || '이미지를 불러올 수 없습니다. 다른 파일을 선택해 주세요.', 'error');
  }
}

// Picks the first image among possibly-multiple incoming files (drop or
// paste can both deliver more than one) and warns when there was more than
// one candidate, since only a single representative photo is supported.
function processIncomingActivityFiles(fileList, opts) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  const finalOpts = Object.assign({}, opts);
  if (files.length > 1) {
    setActivityPhotoMessage('대표사진에는 한 장만 등록할 수 있습니다.', 'warning');
    finalOpts.keepMessage = true;
  }
  const target = files.find((f) => ALLOWED_IMAGE_TYPES.includes(f.type)) || files[0];
  handleIncomingActivityImage(target, finalOpts);
}

function setupActivityPhotoZone() {
  const toggle = document.getElementById('activity-photo-toggle');
  const closeBtn = document.getElementById('activity-photo-close-btn');
  const panel = document.getElementById('activity-photo-panel');
  const input = document.getElementById('activity-photo-input');
  const browseBtn = document.getElementById('activity-photo-browse-btn');
  const browseAgainBtn = document.getElementById('activity-photo-browse-again-btn');
  const cancelBtn = document.getElementById('activity-photo-cancel-btn');
  const removeExistingBtn = document.getElementById('activity-photo-remove-existing-btn');
  if (!toggle || !panel || !input) return;

  toggle.addEventListener('click', () => {
    setActivityPhotoPanelExpanded(!isActivityPhotoPanelExpanded());
  });
  if (closeBtn) closeBtn.addEventListener('click', () => setActivityPhotoPanelExpanded(false));

  // '파일에서 선택' / '다른 사진 선택' — the only two things that ever open
  // the OS file picker; the panel itself is otherwise just a drop/paste
  // target, never a click-to-browse surface.
  const openFilePicker = () => input.click();
  if (browseBtn) browseBtn.addEventListener('click', openFilePicker);
  if (browseAgainBtn) browseAgainBtn.addEventListener('click', openFilePicker);

  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = ''; // let re-selecting the same file fire another change event
    if (file) processIncomingActivityFiles([file]);
  });

  // Only intercepts a paste that actually contains an image — a text-only
  // clipboard passes through untouched, and this listener lives on the
  // panel itself, so it only ever fires while the panel is focused (never
  // hijacks paste in the title/description fields elsewhere in the form).
  panel.addEventListener('paste', (e) => {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const imageItems = items.filter((it) => it.kind === 'file' && it.type && it.type.indexOf('image/') === 0);
    if (imageItems.length === 0) return;
    e.preventDefault();
    const keepMessage = imageItems.length > 1;
    if (keepMessage) {
      setActivityPhotoMessage('대표사진에는 한 장만 등록할 수 있습니다.', 'warning');
    }
    const raw = imageItems[0].getAsFile();
    if (!raw) {
      setActivityPhotoMessage('이미지를 붙여넣을 수 없습니다. 다시 캡처하거나 파일을 선택해 주세요.', 'error');
      return;
    }
    // Screenshot tools typically hand back a generic/blank filename — swap
    // it for a clear, sortable placeholder rather than showing "image.png".
    const hasRealName = raw.name && !/^image\.(png|jpe?g|webp)$/i.test(raw.name);
    if (hasRealName) {
      handleIncomingActivityImage(raw, { keepMessage });
    } else {
      const ext = (raw.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const named = new File([raw], 'screenshot-' + Date.now() + '.' + ext, { type: raw.type || 'image/png' });
      handleIncomingActivityImage(named, { label: '화면 캡처 이미지', keepMessage });
    }
  });

  const hintMain = document.getElementById('activity-photo-hint-main');
  ['dragenter', 'dragover'].forEach((evt) => {
    panel.addEventListener(evt, (e) => {
      e.preventDefault();
      panel.classList.add('drag-active');
      if (hintMain) hintMain.textContent = '여기에 이미지를 놓으세요.';
    });
  });

  panel.addEventListener('dragleave', (e) => {
    if (panel.contains(e.relatedTarget)) return; // still inside the panel (moved over a child) — not a real leave
    panel.classList.remove('drag-active');
    if (hintMain) hintMain.textContent = '파일을 선택하거나 여기에 끌어다 놓으세요.';
  });

  panel.addEventListener('drop', (e) => {
    e.preventDefault();
    panel.classList.remove('drag-active');
    if (hintMain) hintMain.textContent = '파일을 선택하거나 여기에 끌어다 놓으세요.';
    processIncomingActivityFiles(e.dataTransfer.files);
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      clearPendingImage();
      setActivityPhotoMessage('', '');
      renderActivityPhotoPanel();
    });
  }

  if (removeExistingBtn) {
    removeExistingBtn.addEventListener('click', () => {
      removeExistingImage = true;
      renderActivityPhotoCollapsed();
    });
  }
}

// Safety net: a drop that misses the panel would otherwise make the browser
// navigate to/open the dropped file. This always preventDefault()s, but that
// never interferes with an actual in-panel drop — the panel's own listener
// above already ran and did the real handling by the time the event
// reaches window.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

function enterActivityEditMode(row) {
  const form = document.getElementById('activity-form');
  form.elements['id'].value = row.id;
  form.elements['title'].value = row.title;
  form.elements['year'].value = row.year;
  form.elements['field'].value = row.field;
  form.elements['role'].value = row.role;
  form.elements['type'].value = row.type;
  form.elements['description'].value = row.description || '';
  form.elements['featured'].checked = !!row.featured;

  existingImageUrl = row.image_url || null;
  existingImagePath = row.image_path || null;
  removeExistingImage = false;
  clearPendingImage();
  setActivityPhotoMessage('', '');
  setActivityPhotoPanelExpanded(false);
  renderActivityPhoto();

  document.getElementById('activity-form-submit').textContent = '활동 저장';
  document.getElementById('activity-form-cancel').style.display = 'inline';
  clearSuccessActions('activity-form-actions');
  document.getElementById('activity-form-message').textContent = '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function exitActivityEditMode() {
  const form = document.getElementById('activity-form');
  if (!form) return;
  form.reset();
  form.elements['id'].value = '';

  existingImageUrl = null;
  existingImagePath = null;
  removeExistingImage = false;
  clearPendingImage();
  setActivityPhotoMessage('', '');
  setActivityPhotoPanelExpanded(false);
  renderActivityPhoto();

  document.getElementById('activity-form-submit').textContent = '활동 추가';
  document.getElementById('activity-form-cancel').style.display = 'none';
}

function setupActivityForm() {
  const form = document.getElementById('activity-form');
  const message = document.getElementById('activity-form-message');
  let isSubmitting = false;

  document.getElementById('activity-form-cancel').addEventListener('click', exitActivityEditMode);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = document.getElementById('activity-form-submit');
    const wasEditing = !!form.elements['id'].value;
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중…';
    message.textContent = '';
    message.className = 'form-message';
    clearSuccessActions('activity-form-actions');

    let newUpload = null;

    try {
      const fd = new FormData(form);
      const editingId = fd.get('id');

      const title = (fd.get('title') || '').trim();
      const description = (fd.get('description') || '').trim();
      const year = Number(fd.get('year'));
      if (!title) throw new Error('제목을 입력해 주세요.');
      if (title.length > 200) throw new Error('제목은 200자 이내로 입력해 주세요.');
      if (description.length > 2000) throw new Error('설명은 2000자 이내로 입력해 주세요.');
      if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('연도를 올바르게 입력해 주세요 (2000~2100).');

      // Photo state comes entirely from the shared pending-image state set up
      // by handleIncomingActivityImage() — never from input.files/FormData —
      // so it's identical regardless of whether the photo arrived via the
      // file picker, a drag-drop, or a clipboard paste.
      let imageUrl = editingId ? existingImageUrl : null;
      let imagePath = editingId ? existingImagePath : null;
      const oldImagePath = imagePath;

      if (pendingImageFile) {
        message.textContent = '사진 업로드 중…';
        newUpload = await uploadToStorage(pendingImageFile, 'activities');
        imageUrl = newUpload.url;
        imagePath = newUpload.path;
      } else if (removeExistingImage) {
        imageUrl = null;
        imagePath = null;
      }

      const featured = fd.get('featured') === 'on';
      const otherFeaturedCount = currentData.activities.filter((a) => a.featured && String(a.id) !== String(editingId)).length;

      const row = {
        title, year,
        field: fd.get('field'),
        role: fd.get('role'),
        type: fd.get('type'),
        description,
        image_url: imageUrl,
        image_path: imagePath,
        featured,
        featured_order: featured ? otherFeaturedCount + 1 : null
      };

      if (editingId) {
        const { error } = await supabaseClient.from('activities').update(row).eq('id', editingId);
        if (error) throw new Error(describeSupabaseError(error));
      } else {
        // New activity → first in its year group (not the global bottom).
        row.sort_order = firstSortOrderForYear(currentData.activities, year);
        const { error } = await supabaseClient.from('activities').insert(row);
        if (error) throw new Error(describeSupabaseError(error));
      }

      // DB write succeeded — only now is it safe to remove the old image.
      if (oldImagePath && oldImagePath !== imagePath && !isImagePathStillReferenced(oldImagePath, editingId)) {
        await safeRemoveStoragePath(oldImagePath);
      }

      exitActivityEditMode();
      message.textContent = '활동 기록이 저장되었습니다.';
      message.className = 'form-message success';
      const pages = featured ? [PAGES.home, PAGES.records] : [PAGES.records];
      renderSuccessActions('activity-form-actions', pages);
      await loadAll();
    } catch (err) {
      // The DB write never happened (or failed) but a new file may already be
      // sitting in Storage — clean up that orphan rather than leaving it.
      if (newUpload) safeRemoveStoragePath(newUpload.path);
      message.textContent = err.message || describeSupabaseError(err);
      message.className = 'form-message error';
      submitBtn.textContent = wasEditing ? '활동 저장' : '활동 추가';
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
    }
  });
}

// ── 전문 분야 form (add + edit) ──

function enterSpecialtyEditMode(row) {
  const form = document.getElementById('specialty-form');
  form.elements['id'].value = row.id;
  form.elements['name'].value = row.name;
  form.elements['description'].value = row.description;
  document.getElementById('specialty-form-submit').textContent = '전문 분야 저장';
  document.getElementById('specialty-form-cancel').style.display = 'inline';
  clearSuccessActions('specialty-form-actions');
  document.getElementById('specialty-form-message').textContent = '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function exitSpecialtyEditMode() {
  const form = document.getElementById('specialty-form');
  if (!form) return;
  form.reset();
  form.elements['id'].value = '';
  document.getElementById('specialty-form-submit').textContent = '전문 분야 추가';
  document.getElementById('specialty-form-cancel').style.display = 'none';
}

function setupSpecialtyForm() {
  const form = document.getElementById('specialty-form');
  const message = document.getElementById('specialty-form-message');
  let isSubmitting = false;

  document.getElementById('specialty-form-cancel').addEventListener('click', exitSpecialtyEditMode);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = document.getElementById('specialty-form-submit');
    const wasEditing = !!form.elements['id'].value;
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중…';
    message.textContent = '';
    message.className = 'form-message';
    clearSuccessActions('specialty-form-actions');

    try {
      const fd = new FormData(form);
      const editingId = fd.get('id');
      const name = (fd.get('name') || '').trim();
      const description = (fd.get('description') || '').trim();
      if (!name) throw new Error('이름을 입력해 주세요.');
      if (name.length > 100) throw new Error('이름은 100자 이내로 입력해 주세요.');
      if (!description) throw new Error('설명을 입력해 주세요.');
      if (description.length > 1000) throw new Error('설명은 1000자 이내로 입력해 주세요.');

      const row = { name, description };

      if (editingId) {
        const { error } = await supabaseClient.from('specialties').update(row).eq('id', editingId);
        if (error) throw new Error(describeSupabaseError(error));
      } else {
        row.sort_order = nextSortOrder(currentData.specialties);
        const { error } = await supabaseClient.from('specialties').insert(row);
        if (error) throw new Error(describeSupabaseError(error));
      }

      exitSpecialtyEditMode();
      message.textContent = '전문 분야가 저장되었습니다.';
      message.className = 'form-message success';
      renderSuccessActions('specialty-form-actions', [PAGES.home]);
      await loadAll();
    } catch (err) {
      message.textContent = err.message || describeSupabaseError(err);
      message.className = 'form-message error';
      submitBtn.textContent = wasEditing ? '전문 분야 저장' : '전문 분야 추가';
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
    }
  });
}

// ── 주요 이력 form (add + edit) ──
//
// The finished sentence ("2024 – 현재") is never stored — formatCareerPeriod()
// (site-data.js) builds it from start_year/end_year/is_current at render
// time, both here in the admin list preview and on the public about page.

function careerRowHtml(c) {
  return `
    <div class="mgmt-row" data-id="${escHtml(c.id)}">
      <div class="mgmt-row-body">
        <span class="mgmt-row-title">${escHtml(formatCareerPeriod(c))}</span>
        <span class="mgmt-row-meta">${escHtml(c.title)}</span>
      </div>
      <button class="mgmt-row-edit" type="button" data-table="careers" data-id="${escHtml(c.id)}">수정</button>
      <button class="mgmt-row-delete" type="button" data-table="careers" data-id="${escHtml(c.id)}">삭제</button>
    </div>`;
}

// "현재 진행 중" 체크 시 종료 연도 입력란을 비우고 비활성화합니다 — is_current가
// true인 행은 항상 end_year가 null이어야 한다는 DB 제약과 짝을 맞춘 UX입니다.
function setCareerEndYearDisabled(disabled) {
  const endYearInput = document.getElementById('career-end-year');
  if (!endYearInput) return;
  endYearInput.disabled = disabled;
  if (disabled) endYearInput.value = '';
}

function enterCareerEditMode(row) {
  const form = document.getElementById('career-form');
  form.elements['id'].value = row.id;
  form.elements['start_year'].value = row.start_year;
  form.elements['is_current'].checked = !!row.is_current;
  setCareerEndYearDisabled(!!row.is_current);
  if (!row.is_current) form.elements['end_year'].value = row.end_year != null ? row.end_year : '';
  form.elements['title'].value = row.title;

  document.getElementById('career-form-submit').textContent = '이력 저장';
  document.getElementById('career-form-cancel').style.display = 'inline';
  clearSuccessActions('career-form-actions');
  document.getElementById('career-form-message').textContent = '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function exitCareerEditMode() {
  const form = document.getElementById('career-form');
  if (!form) return;
  form.reset();
  form.elements['id'].value = '';
  setCareerEndYearDisabled(false);
  document.getElementById('career-form-submit').textContent = '이력 추가';
  document.getElementById('career-form-cancel').style.display = 'none';
}

function setupCareerForm() {
  const form = document.getElementById('career-form');
  const message = document.getElementById('career-form-message');
  const isCurrentCheckbox = document.getElementById('career-is-current');
  let isSubmitting = false;

  document.getElementById('career-form-cancel').addEventListener('click', exitCareerEditMode);
  isCurrentCheckbox.addEventListener('change', () => setCareerEndYearDisabled(isCurrentCheckbox.checked));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = document.getElementById('career-form-submit');
    const wasEditing = !!form.elements['id'].value;
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중…';
    message.textContent = '';
    message.className = 'form-message';
    clearSuccessActions('career-form-actions');

    try {
      const fd = new FormData(form);
      const editingId = fd.get('id');
      const title = (fd.get('title') || '').trim();
      const isCurrent = fd.get('is_current') === 'on';

      if (!title) throw new Error('이력 내용을 입력해 주세요.');
      if (title.length > 300) throw new Error('이력 내용은 300자 이내로 입력해 주세요.');

      const startYearRaw = fd.get('start_year');
      const startYear = Number(startYearRaw);
      if (!startYearRaw || !Number.isInteger(startYear) || startYear < 1950 || startYear > 2100) {
        throw new Error('시작 연도를 올바르게 입력해 주세요 (1950~2100).');
      }

      // is_current면 종료 연도를 항상 비워서 보냅니다 — DB 제약(careers_current_no_end)과
      // 일치시켜, 체크박스와 실제 저장값이 서로 어긋나는 상태를 만들지 않습니다.
      let endYear = null;
      const endYearRaw = isCurrent ? '' : (fd.get('end_year') || '');
      if (endYearRaw !== '') {
        endYear = Number(endYearRaw);
        if (!Number.isInteger(endYear) || endYear < 1950 || endYear > 2100) {
          throw new Error('종료 연도를 올바르게 입력해 주세요 (1950~2100).');
        }
        if (endYear < startYear) throw new Error('종료 연도는 시작 연도 이후여야 합니다.');
      }

      const row = { start_year: startYear, end_year: endYear, is_current: isCurrent, title };

      if (editingId) {
        row.updated_at = new Date().toISOString();
        const { error } = await supabaseClient.from('careers').update(row).eq('id', editingId);
        if (error) throw new Error(describeSupabaseError(error));
      } else {
        const { error } = await supabaseClient.from('careers').insert(row);
        if (error) throw new Error(describeSupabaseError(error));
      }

      exitCareerEditMode();
      message.textContent = '주요 이력이 저장되었습니다.';
      message.className = 'form-message success';
      renderSuccessActions('career-form-actions', [PAGES.about]);
      await loadAll();
    } catch (err) {
      message.textContent = err.message || describeSupabaseError(err);
      message.className = 'form-message error';
      submitBtn.textContent = wasEditing ? '이력 저장' : '이력 추가';
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
    }
  });
}

// ── 관심 주제 form (add + edit) ──

function enterInterestEditMode(row) {
  const form = document.getElementById('interest-form');
  form.elements['id'].value = row.id;
  form.elements['label'].value = row.label;
  document.getElementById('interest-form-submit').textContent = '관심 주제 저장';
  document.getElementById('interest-form-cancel').style.display = 'inline';
  clearSuccessActions('interest-form-actions');
  document.getElementById('interest-form-message').textContent = '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function exitInterestEditMode() {
  const form = document.getElementById('interest-form');
  if (!form) return;
  form.reset();
  form.elements['id'].value = '';
  document.getElementById('interest-form-submit').textContent = '관심 주제 추가';
  document.getElementById('interest-form-cancel').style.display = 'none';
}

function setupInterestForm() {
  const form = document.getElementById('interest-form');
  const message = document.getElementById('interest-form-message');
  let isSubmitting = false;

  document.getElementById('interest-form-cancel').addEventListener('click', exitInterestEditMode);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = document.getElementById('interest-form-submit');
    const wasEditing = !!form.elements['id'].value;
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중…';
    message.textContent = '';
    message.className = 'form-message';
    clearSuccessActions('interest-form-actions');

    try {
      const fd = new FormData(form);
      const editingId = fd.get('id');
      const label = (fd.get('label') || '').trim();
      if (!label) throw new Error('태그를 입력해 주세요.');
      if (label.length > 50) throw new Error('태그는 50자 이내로 입력해 주세요.');
      const isDuplicate = currentData.interests.some((i) => i.label === label && String(i.id) !== String(editingId));
      if (isDuplicate) throw new Error('이미 등록된 관심 주제입니다.');

      const row = { label };

      if (editingId) {
        const { error } = await supabaseClient.from('interests').update(row).eq('id', editingId);
        if (error) throw new Error(describeSupabaseError(error));
      } else {
        row.sort_order = nextSortOrder(currentData.interests);
        const { error } = await supabaseClient.from('interests').insert(row);
        if (error) throw new Error(describeSupabaseError(error));
      }

      exitInterestEditMode();
      message.textContent = '관심 주제가 저장되었습니다.';
      message.className = 'form-message success';
      renderSuccessActions('interest-form-actions', [PAGES.about]);
      await loadAll();
    } catch (err) {
      message.textContent = err.message || describeSupabaseError(err);
      message.className = 'form-message error';
      submitBtn.textContent = wasEditing ? '관심 주제 저장' : '관심 주제 추가';
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
    }
  });
}

// ── 히어로 / 프로필 사진 슬롯 ──

function setupPhotoSlot({ key, folder, inputId, imgId, buttonId, messageId, actionsId, page, successLabel }) {
  const input = document.getElementById(inputId);
  const button = document.getElementById(buttonId);
  const message = document.getElementById(messageId);
  let isUploading = false;

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) showPreview(imgId, URL.createObjectURL(file));
  });

  button.addEventListener('click', async () => {
    if (isUploading) return;
    const file = input.files[0];
    if (!file) {
      message.textContent = '먼저 사진을 선택하세요.';
      message.className = 'form-message error';
      return;
    }

    isUploading = true;
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = '업로드 중…';
    message.textContent = '';
    message.className = 'form-message';
    clearSuccessActions(actionsId);

    let newUpload = null;

    try {
      newUpload = await uploadToStorage(file, folder);

      const oldRow = currentData.settingsRows.find((r) => r.key === key);
      const oldPath = oldRow ? oldRow.path : null;

      const { error } = await supabaseClient.from('settings').update({ value: newUpload.url, path: newUpload.path }).eq('key', key);
      if (error) throw new Error(describeSupabaseError(error));

      if (oldPath && oldPath !== newUpload.path) {
        await safeRemoveStoragePath(oldPath);
      }

      message.textContent = successLabel;
      message.className = 'form-message success';
      renderSuccessActions(actionsId, [page]);
      await loadAll();
    } catch (err) {
      if (newUpload) safeRemoveStoragePath(newUpload.path);
      message.textContent = err.message || describeSupabaseError(err);
      message.className = 'form-message error';
    } finally {
      isUploading = false;
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}

async function init() {
  setupGate();
  setupPhotoSlot({
    key: 'hero_image_url', folder: 'hero',
    inputId: 'hero-photo-input', imgId: 'hero-photo-preview', buttonId: 'hero-photo-upload-btn',
    messageId: 'hero-photo-message', actionsId: 'hero-photo-actions', page: PAGES.home,
    successLabel: '히어로 사진이 교체되었습니다.'
  });
  setupPhotoSlot({
    key: 'about_portrait_url', folder: 'profile',
    inputId: 'about-photo-input', imgId: 'about-photo-preview', buttonId: 'about-photo-upload-btn',
    messageId: 'about-photo-message', actionsId: 'about-photo-actions', page: PAGES.about,
    successLabel: '프로필 사진이 교체되었습니다.'
  });
  setupActivityPhotoZone();
  setupActivityForm();
  setupSpecialtyForm();
  setupCareerForm();
  setupInterestForm();
  COPY_GROUPS.forEach((g) => setupCopyForm(g));

  try {
    const loggedIn = await checkSession();
    if (loggedIn) {
      showShell();
    } else {
      await supabaseClient.auth.signOut().catch(() => {});
      showGate();
    }
  } catch (err) {
    // Network/config failure while checking the session — fail safe to the
    // login screen with a clear reason instead of leaving the page stuck.
    document.getElementById('gate-error').textContent = describeSupabaseError(err);
    showGate();
  }
}

init();
