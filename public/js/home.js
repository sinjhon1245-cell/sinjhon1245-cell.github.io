(function () {
  const featuredGrid = document.getElementById('featured-grid');
  const specialtiesList = document.getElementById('specialties-list');
  const timelineBody = document.getElementById('timeline-body');

  function featuredCardHtml(a, index) {
    const num = String(index + 1).padStart(2, '0');
    const imageResult = resolveActivityImage(a);
    let imageHtml = '';
    if (imageResult) {
      const isReal = imageResult.type === 'real';
      const alt = isReal ? escHtml(a.title) : '';
      const decorative = isReal ? '' : ' aria-hidden="true"';
      imageHtml = '<div class="img-frame featured-frame"><img src="' + escHtml(imageResult.url) + '" alt="' + alt + '"' + decorative +
        ' data-field="' + escHtml(a.field) + '" onerror="handleActivityImageError(this)" decoding="async"></div>';
    }
    return '' +
      '<article class="featured-card">' +
        imageHtml +
        '<div class="featured-meta">' +
          '<span class="featured-num">' + num + '</span>' +
          '<span class="featured-when">' + escHtml(a.year) + ' · ' + escHtml(a.field) + '</span>' +
        '</div>' +
        '<h3>' + escHtml(a.title) + '</h3>' +
        '<p>' + escHtml(a.description) + '</p>' +
      '</article>';
  }

  function specialtyRowHtml(s, index) {
    const num = String(index + 1).padStart(2, '0');
    return '' +
      '<div class="specialty-row">' +
        '<span class="specialty-num">' + num + '</span>' +
        '<span class="specialty-name">' + escHtml(s.name) + '</span>' +
        '<span class="specialty-desc">' + escHtml(s.description) + '</span>' +
      '</div>';
  }

  function timelineHtml(activities) {
    const years = Array.from(new Set(activities.map((a) => a.year))).sort((a, b) => b - a);
    return years.map((year) => {
      const items = activities.filter((a) => a.year === year);
      const itemsHtml = items.map((a) => '' +
        '<div class="timeline-item">' +
          '<span class="timeline-item-title">' + escHtml(a.title) + '</span>' +
          '<span class="timeline-item-meta">' + escHtml(a.field) + ' · ' + escHtml(a.role) + ' · ' + escHtml(a.type) + '</span>' +
        '</div>'
      ).join('');
      return '' +
        '<div class="timeline-year-block">' +
          '<span class="timeline-year">' + year + '</span>' +
          '<div class="timeline-items">' + itemsHtml + '</div>' +
        '</div>';
    }).join('');
  }

  // Updated once fetchSiteContent() resolves (see init()) — read at click
  // time so the copy button always copies whatever contact_email currently
  // resolves to, even if it changes after this page has loaded.
  let resolvedContactEmail = SITE_COPY_DEFAULTS.contact_email;

  function setupEmailCopy() {
    const button = document.getElementById('cta-copy-btn');
    if (!button) return;

    const DEFAULT_LABEL = '이메일 주소 복사';
    const SUCCESS_LABEL = '주소가 복사되었습니다';
    const FAIL_LABEL = '복사에 실패했습니다';
    let resetTimer = null;

    // Shows a temporary label on the button itself (never the raw address)
    // and reverts to the default label after ~2 seconds.
    function flashLabel(text) {
      button.textContent = text;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { button.textContent = DEFAULT_LABEL; }, 2000);
    }

    // Fallback for browsers/contexts where navigator.clipboard is unavailable
    // (older browsers, non-HTTPS contexts) — copies via a temporary, invisible
    // textarea and the legacy execCommand API.
    function fallbackCopy() {
      const textarea = document.createElement('textarea');
      textarea.value = resolvedContactEmail;
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(textarea);
      return ok;
    }

    button.addEventListener('click', async () => {
      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(resolvedContactEmail);
          copied = true;
        } catch (e) {
          copied = fallbackCopy();
        }
      } else {
        copied = fallbackCopy();
      }
      flashLabel(copied ? SUCCESS_LABEL : FAIL_LABEL);
    });
  }

  async function init() {
    try {
      const data = await fetchSiteContent();

      if (data.settings) applyRemoteImage('hero-photo', data.settings.hero_image_url);

      const heroTitle = document.querySelector('.hero-title');
      if (heroTitle) heroTitle.textContent = getSiteCopy(data.settings, 'home_hero_title');
      const heroSub = document.querySelector('.hero-sub');
      if (heroSub) heroSub.textContent = getSiteCopy(data.settings, 'home_hero_description');
      const recordsBtn = document.querySelector('.btn-primary');
      if (recordsBtn) recordsBtn.textContent = getSiteCopy(data.settings, 'home_records_button_label');
      const aboutBtn = document.querySelector('.link-underline');
      if (aboutBtn) aboutBtn.textContent = getSiteCopy(data.settings, 'home_about_button_label');
      resolvedContactEmail = applyGlobalSiteCopy(data.settings);

      const featured = data.activities
        .filter((a) => a.featured)
        .sort((a, b) => (a.featured_order || 0) - (b.featured_order || 0));

      if (featuredGrid) {
        featuredGrid.innerHTML = featured.length
          ? featured.map(featuredCardHtml).join('')
          : '<p class="content-empty">아직 대표 활동이 없습니다.</p>';
      }

      if (specialtiesList) {
        specialtiesList.innerHTML = data.specialties.length
          ? data.specialties.map(specialtyRowHtml).join('')
          : '<p class="content-empty">아직 등록된 전문 분야가 없습니다.</p>';
      }

      if (timelineBody) {
        timelineBody.innerHTML = data.activities.length
          ? timelineHtml(data.activities)
          : '<p class="content-empty">아직 활동기록이 없습니다.</p>';
      }
    } catch (err) {
      const message = describeSupabaseError(err);
      [featuredGrid, specialtiesList, timelineBody].forEach((el) => {
        if (el) el.innerHTML = '<p class="content-error">' + escHtml(message) + '</p>';
      });
    }
  }

  setupEmailCopy();
  init();
})();
