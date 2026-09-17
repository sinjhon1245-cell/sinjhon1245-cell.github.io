(function () {
  const featuredGrid = document.getElementById('featured-grid');
  const specialtiesList = document.getElementById('specialties-list');
  const timelineBody = document.getElementById('timeline-body');
  const timelineSummary = document.getElementById('timeline-summary');

  // Matches .featured-grid's real layout: 1 column with 20px side padding at
  // ≤768px, a 2-column grid inside the 1200px-capped, 40px-padded wrap above
  // that (each column ≈ 50vw minus padding/gap, topping out at ~546px).
  const FEATURED_IMAGE_SIZES = '(max-width: 768px) calc(100vw - 40px), (max-width: 1200px) calc(50vw - 54px), 546px';

  // How many activities each year block on the home page shows before
  // handing off to records.html. Keeps the home page a fixed height no
  // matter how many activities accumulate (the full list lives on the
  // records page, filtered by year).
  const SUMMARY_PER_YEAR = 3;

  function featuredCardHtml(a, index) {
    const num = String(index + 1).padStart(2, '0');
    const imageHtml = activityImageHtml(a, { frameClass: 'featured-frame', sizes: FEATURED_IMAGE_SIZES, defer: true });
    const href = recordsUrl({ year: a.year, id: a.id });
    return '' +
      '<article class="featured-card">' +
        imageHtml +
        '<div class="featured-meta">' +
          '<span class="featured-num">' + num + '</span>' +
          '<span class="featured-when">' + escHtml(a.year) + ' · ' + escHtml(a.field) + '</span>' +
        '</div>' +
        '<h3 class="featured-title"><a class="card-link" href="' + escHtml(href) + '">' + escHtml(a.title) + '</a></h3>' +
        '<p class="featured-desc">' + escHtml(a.description) + '</p>' +
      '</article>';
  }

  // Each specialty row doubles as an entry point into the records page: when
  // the specialty name is one of the activity fields, it shows how many
  // activities carry that field and links to the filtered list.
  function specialtyRowHtml(s, index, fieldCounts) {
    const num = String(index + 1).padStart(2, '0');
    const count = fieldCounts[s.name] || 0;
    const countHtml = count ? '<span class="specialty-count">' + count + '건</span>' : '';
    const linkHtml = count
      ? '<a class="specialty-link" href="' + escHtml(recordsUrl({ field: s.name })) + '">활동 보기 →</a>'
      : '';
    return '' +
      '<div class="specialty-row">' +
        '<span class="specialty-num">' + num + '</span>' +
        '<div class="specialty-head">' +
          '<span class="specialty-name">' + escHtml(s.name) + '</span>' +
          countHtml +
        '</div>' +
        '<span class="specialty-desc">' + escHtml(s.description) + '</span>' +
        linkHtml +
      '</div>';
  }

  // Year-by-year summary: for each year, the count and the first few
  // activities in the same order the records page uses, plus a link to that
  // year's full list. Bounded growth — a new year adds one block, a new
  // activity never adds a row once the year already shows SUMMARY_PER_YEAR.
  function yearSummaryHtml(activities) {
    const sorted = sortActivitiesForDisplay(activities);
    const years = Array.from(new Set(sorted.map((a) => a.year)));
    return years.map((year) => {
      const items = sorted.filter((a) => a.year === year);
      const shown = items.slice(0, SUMMARY_PER_YEAR);
      const itemsHtml = shown.map((a) => '' +
        '<li class="year-item">' +
          '<a class="year-item-title" href="' + escHtml(recordsUrl({ year: year, id: a.id })) + '">' + escHtml(a.title) + '</a>' +
          '<span class="year-item-meta">' + escHtml(a.field) + ' · ' + escHtml(a.type) + '</span>' +
        '</li>'
      ).join('');
      const moreLabel = items.length > shown.length
        ? escHtml(year) + '년 활동 ' + items.length + '건 전체 보기 →'
        : escHtml(year) + '년 활동 보기 →';
      return '' +
        '<div class="year-block">' +
          '<div class="year-head">' +
            '<a class="year-label" href="' + escHtml(recordsUrl({ year: year })) + '">' + escHtml(year) + '</a>' +
            '<span class="year-count">' + items.length + '건</span>' +
          '</div>' +
          '<ul class="year-items">' + itemsHtml + '</ul>' +
          '<a class="year-more" href="' + escHtml(recordsUrl({ year: year })) + '">' + moreLabel + '</a>' +
        '</div>';
    }).join('');
  }

  // "AI·SW교육 / 과학·융합교육" (admin-editable) → focus chips under the hero
  // title. A chip that names one of the six activity fields links straight
  // to the records page filtered by that field; anything else is plain text.
  function renderHeroFocus(settings) {
    const el = document.getElementById('hero-focus');
    if (!el) return;
    const raw = getSiteCopy(settings, 'home_hero_focus');
    const parts = raw.split('/').map((s) => s.trim()).filter(Boolean);
    el.innerHTML = parts.map((label) => {
      if (ACTIVITY_FIELDS.indexOf(label) !== -1) {
        return '<a class="hero-focus-chip" href="' + escHtml(recordsUrl({ field: label })) + '">' + escHtml(label) + '</a>';
      }
      return '<span class="hero-focus-chip">' + escHtml(label) + '</span>';
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
    // and reverts to the default label after ~2 seconds. The button carries
    // aria-live so the change is announced.
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

  function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  async function init() {
    try {
      const data = await fetchSiteContent();

      if (data.settings) applyRemoteImage('hero-photo', data.settings.hero_image_url);

      setText('#hero-eyebrow', getSiteCopy(data.settings, 'home_hero_eyebrow'));
      setText('.hero-title', getSiteCopy(data.settings, 'home_hero_title'));
      setText('.hero-sub', getSiteCopy(data.settings, 'home_hero_description'));
      setText('.btn-primary', getSiteCopy(data.settings, 'home_records_button_label'));
      setText('.link-underline', getSiteCopy(data.settings, 'home_about_button_label'));
      renderHeroFocus(data.settings);
      resolvedContactEmail = applyGlobalSiteCopy(data.settings);

      const featured = data.activities
        .filter((a) => a.featured)
        .sort((a, b) => (a.featured_order || 0) - (b.featured_order || 0));

      if (featuredGrid) {
        featuredGrid.innerHTML = featured.length
          ? featured.map(featuredCardHtml).join('')
          : '<p class="content-empty">아직 대표 활동이 없습니다.</p>';
        // Images are requested only now that the cards are laid out, so the
        // on-screen ones load eagerly and the rest lazily (site-data.js).
        Array.from(featuredGrid.querySelectorAll('img[data-src]')).forEach((img, i) => assignDeferredImage(img, i === 0));
      }

      const fieldCounts = {};
      data.activities.forEach((a) => { fieldCounts[a.field] = (fieldCounts[a.field] || 0) + 1; });

      if (specialtiesList) {
        specialtiesList.innerHTML = data.specialties.length
          ? data.specialties.map((s, i) => specialtyRowHtml(s, i, fieldCounts)).join('')
          : '<p class="content-empty">아직 등록된 전문 분야가 없습니다.</p>';
      }

      if (timelineBody) {
        timelineBody.innerHTML = data.activities.length
          ? yearSummaryHtml(data.activities)
          : '<p class="content-empty">아직 활동기록이 없습니다.</p>';
      }

      if (timelineSummary && data.activities.length) {
        const years = data.activities.map((a) => Number(a.year)).filter(Boolean);
        const minYear = Math.min.apply(null, years);
        const maxYear = Math.max.apply(null, years);
        timelineSummary.textContent = '총 ' + data.activities.length + '건 · ' +
          (minYear === maxYear ? String(minYear) : minYear + '–' + maxYear);
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
