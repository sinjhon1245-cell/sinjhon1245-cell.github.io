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
    pages: [PAGES.home, PAGES.records, PAGES.about],
    fields: [
      { key: 'contact_heading', label: '문의 영역 제목' },
      { key: 'contact_email', label: '받는 이메일 주소' },
      { key: 'contact_email_subject', label: '메일 제목' },
      { key: 'footer_slogan', label: '푸터 슬로건' }
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
  ['activity-form-actions', 'specialty-form-actions', 'interest-form-actions', 'hero-photo-actions', 'about-photo-actions']
    .forEach(clearSuccessActions);
  ['activity-form-message', 'specialty-form-message', 'interest-form-message', 'hero-photo-message', 'about-photo-message']
    .forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = ''; });
  currentData = { activities: [], specialties: [], interests: [], settings: {}, settingsRows: [] };
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

let currentData = { activities: [], specialties: [], interests: [], settings: {}, settingsRows: [] };

function activityRowHtml(a) {
  const thumb = a.image_url
    ? `<img class="mgmt-row-thumb" src="${escHtml(a.image_url)}" alt="">`
    : `<div class="mgmt-row-thumb-placeholder"></div>`;
  const badge = a.featured ? '<span class="mgmt-row-badge">대표 활동</span>' : '';
  return `
    <div class="mgmt-row" data-id="${escHtml(a.id)}">
      ${thumb}
      <div class="mgmt-row-body">
        <span class="mgmt-row-title">${escHtml(a.title)}</span>
        <span class="mgmt-row-meta">${escHtml(a.year)} · ${escHtml(a.field)} · ${escHtml(a.role)} · ${escHtml(a.type)}</span>
      </div>
      ${badge}
      <button class="mgmt-row-edit" type="button" data-table="activities" data-id="${escHtml(a.id)}">수정</button>
      <button class="mgmt-row-delete" type="button" data-table="activities" data-id="${escHtml(a.id)}">삭제</button>
    </div>`;
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
    currentData = { activities: [], specialties: [], interests: [], settings: {}, settingsRows: [] };
    adminLoadError.textContent = describeSupabaseError(err);
    adminLoadError.style.display = 'block';
  }
  renderList('activities-list', currentData.activities, activityRowHtml, '아직 등록된 활동이 없습니다.');
  renderList('specialties-list-admin', currentData.specialties, specialtyRowHtml, '아직 등록된 전문 분야가 없습니다.');
  renderList('interests-list-admin', currentData.interests, interestRowHtml, '아직 등록된 관심 주제가 없습니다.');
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

      const labels = { activities: '활동 기록이', specialties: '전문 분야가', interests: '관심 주제가' };
      const messageId = { activities: 'activity-form-message', specialties: 'specialty-form-message', interests: 'interest-form-message' }[table];
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
    });
  });
}

function nextSortOrder(rows) {
  return rows.reduce((max, r) => Math.max(max, r.sort_order || 0), 0) + 1;
}

// ── 활동기록 form (add + edit) ──

let editingActivityImageUrl = null;
let editingActivityImagePath = null;

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
  form.elements['photo'].value = '';
  form.elements['remove_photo'].checked = false;
  editingActivityImageUrl = row.image_url || null;
  editingActivityImagePath = row.image_path || null;

  const removeWrap = document.getElementById('activity-remove-photo-wrap');
  if (removeWrap) removeWrap.style.display = row.image_url ? 'flex' : 'none';

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
  editingActivityImageUrl = null;
  editingActivityImagePath = null;
  const removeWrap = document.getElementById('activity-remove-photo-wrap');
  if (removeWrap) removeWrap.style.display = 'none';
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
      const file = fd.get('photo');
      const removePhoto = fd.get('remove_photo') === 'on';

      const title = (fd.get('title') || '').trim();
      const description = (fd.get('description') || '').trim();
      const year = Number(fd.get('year'));
      if (!title) throw new Error('제목을 입력해 주세요.');
      if (title.length > 200) throw new Error('제목은 200자 이내로 입력해 주세요.');
      if (description.length > 2000) throw new Error('설명은 2000자 이내로 입력해 주세요.');
      if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('연도를 올바르게 입력해 주세요 (2000~2100).');

      let imageUrl = editingId ? editingActivityImageUrl : null;
      let imagePath = editingId ? editingActivityImagePath : null;
      const oldImagePath = imagePath;

      if (file && file.size > 0) {
        message.textContent = '사진 업로드 중…';
        newUpload = await uploadToStorage(file, 'activities');
        imageUrl = newUpload.url;
        imagePath = newUpload.path;
      } else if (removePhoto) {
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
        row.sort_order = nextSortOrder(currentData.activities);
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
  setupActivityForm();
  setupSpecialtyForm();
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
