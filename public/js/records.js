(function () {
  const ACTIVITIES_PER_PAGE = 6;

  const grid = document.getElementById('records-grid');
  const countEl = document.querySelector('.records-count');
  const noResultsEl = document.querySelector('.no-results');
  const paginationEl = document.getElementById('records-pagination');
  const yearChipRow = document.getElementById('year-chips');
  const fieldChipRow = document.getElementById('field-chips');

  const active = { year: '전체', field: '전체' };
  let allActivities = [];
  let currentPage = 1;

  // Which control should regain keyboard focus after renderPagination()
  // rebuilds the buttons (replacing innerHTML drops focus to <body>).
  let pendingFocus = null; // 'prev' | 'next' | 'page'

  // Matches .records-grid's actual layout for the two-size images' srcset:
  // 1 column with ~20px side padding at ≤768px, 2 columns between 769 and
  // 1023px, and a 3-column grid inside a 1200px-capped, 40px-padded wrap above
  // that (each column trends toward a fixed ~355px once the wrap hits its
  // max-width, ~30% of viewport below it).
  const RECORD_IMAGE_SIZES = '(max-width: 768px) calc(100vw - 40px), (max-width: 1023px) calc(50vw - 34px), (max-width: 1200px) 30vw, 355px';

  // ── URL state ──
  //
  // records.html?year=2025&field=AI·SW교육&page=2#a-15 — filters, page and
  // a target activity are all readable from the URL so a filtered list can be
  // shared, bookmarked and linked to from the home/about pages (recordsUrl in
  // site-data.js builds the same shape). The hash names a single activity
  // card (id="a-<id>") to scroll to and highlight.
  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    const page = parseInt(params.get('page'), 10);
    return {
      year: params.get('year'),
      field: params.get('field'),
      page: page > 0 ? page : 1,
      id: (window.location.hash || '').replace(/^#a-/, '')
    };
  }

  function writeUrlState(keepHash) {
    const params = new URLSearchParams();
    if (active.year !== '전체') params.set('year', active.year);
    if (active.field !== '전체') params.set('field', active.field);
    if (currentPage > 1) params.set('page', String(currentPage));
    const query = params.toString();
    const hash = keepHash ? window.location.hash : '';
    try {
      window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + hash);
    } catch (e) { /* file:// or sandboxed contexts — URL sync is best-effort */ }
  }

  // ── Cards ──
  //
  // Cards for all activities are built up front, but only the current page's
  // <img> elements ever get a real src/srcset (assignDeferredImage from
  // render()) — other pages' images aren't requested until paged to. The
  // heading is an h2 (the page's h1 is "활동기록") so heading navigation goes
  // h1 → h2 without a skipped level. The field tag is a button that applies
  // that field as the filter.
  function recordCardHtml(a) {
    const imageHtml = activityImageHtml(a, { frameClass: 'record-frame', sizes: RECORD_IMAGE_SIZES, defer: true });
    const description = (a.description || '').trim();
    const descHtml = description ? '<p class="record-desc">' + escHtml(description) + '</p>' : '';
    return '' +
      '<article class="record-card" id="a-' + escHtml(a.id) + '" data-year="' + escHtml(a.year) + '" data-field="' + escHtml(a.field) + '" tabindex="-1">' +
        imageHtml +
        '<div class="record-meta">' +
          '<span class="record-year">' + escHtml(a.year) + '</span>' +
          '<span aria-hidden="true">·</span><span>' + escHtml(a.type) + '</span>' +
          '<span aria-hidden="true">·</span><span>' + escHtml(a.role) + '</span>' +
        '</div>' +
        '<h2 class="record-title">' + escHtml(a.title) + '</h2>' +
        '<div class="record-tags">' +
          '<button type="button" class="record-field" data-field-link="' + escHtml(a.field) + '" aria-label="' + escHtml(a.field) + ' 활동만 보기">' + escHtml(a.field) + '</button>' +
        '</div>' +
        descHtml +
      '</article>';
  }

  // ── Filter chips (built from data) ──
  //
  // Year chips come from the years actually present in the activities (newest
  // first), field chips from ACTIVITY_FIELDS (site-data.js) plus any field
  // value found in the data that isn't in that list, so a new year or an
  // unexpected field never silently disappears from the filter. Each chip
  // shows its count. Selection state is exposed as aria-pressed.
  function chipHtml(group, value, label, count) {
    return '<button type="button" class="chip" data-group="' + group + '" data-value="' + escHtml(value) + '" aria-pressed="false">' +
      escHtml(label) +
      (count != null ? ' <span class="chip-count">' + count + '</span>' : '') +
      '</button>';
  }

  function renderChips() {
    const years = Array.from(new Set(allActivities.map((a) => Number(a.year)).filter(Boolean))).sort((a, b) => b - a);
    const yearCounts = {};
    const fieldCounts = {};
    allActivities.forEach((a) => {
      yearCounts[a.year] = (yearCounts[a.year] || 0) + 1;
      fieldCounts[a.field] = (fieldCounts[a.field] || 0) + 1;
    });

    const fields = ACTIVITY_FIELDS.slice();
    allActivities.forEach((a) => {
      if (a.field && fields.indexOf(a.field) === -1) fields.push(a.field);
    });

    if (yearChipRow) {
      yearChipRow.innerHTML = chipHtml('year', '전체', '전체', allActivities.length) +
        years.map((y) => chipHtml('year', String(y), String(y), yearCounts[y])).join('');
    }
    if (fieldChipRow) {
      fieldChipRow.innerHTML = chipHtml('field', '전체', '전체', allActivities.length) +
        fields.map((f) => chipHtml('field', f, f, fieldCounts[f] || 0)).join('');
    }
  }

  function syncChips() {
    document.querySelectorAll('.chip').forEach((chip) => {
      const on = active[chip.dataset.group] === chip.dataset.value;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // A filter value only "exists" if some chip offers it — an unknown value in
  // the URL falls back to 전체 instead of showing an empty list forever.
  function hasChip(group, value) {
    return !!document.querySelector('.chip[data-group="' + group + '"][data-value="' + CSS.escape(value) + '"]');
  }

  // ── Pagination ──

  // Returns page numbers to show, with '…' markers for gaps — e.g.
  // [1, '…', 4, 5, 6, '…', 10]. Small page counts are returned in full
  // (no ellipsis) since collapsing a handful of pages adds no clarity.
  function getPageNumbers(current, total) {
    const maxSimple = 7;
    if (total <= maxSimple) {
      const all = [];
      for (let i = 1; i <= total; i++) all.push(i);
      return all;
    }

    const delta = 1;
    const range = [1];
    for (let i = current - delta; i <= current + delta; i++) {
      if (i > 1 && i < total) range.push(i);
    }
    range.push(total);

    const withDots = [];
    let last;
    range.forEach((i) => {
      if (last != null) {
        if (i - last === 2) withDots.push(last + 1);
        else if (i - last > 2) withDots.push('…');
      }
      withDots.push(i);
      last = i;
    });
    return withDots;
  }

  function renderPagination(totalPages) {
    if (!paginationEl) return;
    if (totalPages <= 1) {
      paginationEl.innerHTML = '';
      paginationEl.style.display = 'none';
      return;
    }
    paginationEl.style.display = 'flex';

    const prevDisabled = currentPage === 1;
    const nextDisabled = currentPage === totalPages;

    let html = '<button type="button" class="page-btn page-nav page-prev" data-page="' + (currentPage - 1) + '"' +
      (prevDisabled ? ' disabled' : '') + '>이전</button>';

    getPageNumbers(currentPage, totalPages).forEach((item) => {
      if (item === '…') {
        html += '<span class="page-ellipsis" aria-hidden="true">…</span>';
      } else {
        const isCurrent = item === currentPage;
        html += '<button type="button" class="page-btn' + (isCurrent ? ' active' : '') + '" data-page="' + item + '"' +
          (isCurrent ? ' aria-current="page"' : '') + ' aria-label="' + item + '페이지로 이동">' + item + '</button>';
      }
    });

    html += '<button type="button" class="page-btn page-nav page-next" data-page="' + (currentPage + 1) + '"' +
      (nextDisabled ? ' disabled' : '') + '>다음</button>';

    paginationEl.innerHTML = html;
  }

  // After the pagination buttons are rebuilt, put keyboard focus back on the
  // control the user was operating (or the current page button when that
  // control is now disabled) so a keyboard/screen-reader user isn't dropped
  // back to the top of the document.
  function restorePaginationFocus() {
    if (!pendingFocus || !paginationEl) return;
    let target = null;
    if (pendingFocus === 'prev') target = paginationEl.querySelector('.page-prev');
    else if (pendingFocus === 'next') target = paginationEl.querySelector('.page-next');
    if (!target || target.disabled) target = paginationEl.querySelector('.page-btn.active');
    pendingFocus = null;
    if (target) target.focus({ preventScroll: true });
  }

  // Scrolls the card area into view below the sticky header. Respects the
  // user's OS-level "reduce motion" setting instead of forcing smooth scroll.
  function scrollToRecordsTop() {
    const target = document.querySelector('.records-section');
    if (!target) return;
    const header = document.querySelector('.site-header');
    const headerHeight = header ? header.offsetHeight : 0;
    const top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function matchingCards() {
    return Array.from(grid.querySelectorAll('.record-card')).filter((card) =>
      (active.year === '전체' || card.dataset.year === active.year) &&
      (active.field === '전체' || card.dataset.field === active.field)
    );
  }

  function render(opts) {
    const scroll = !!(opts && opts.scroll);
    const keepHash = !!(opts && opts.keepHash);

    const allCards = Array.from(grid.querySelectorAll('.record-card'));
    const matching = matchingCards();

    const totalMatching = matching.length;
    const totalPages = Math.max(1, Math.ceil(totalMatching / ACTIVITIES_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * ACTIVITIES_PER_PAGE;
    const pageCardList = matching.slice(start, start + ACTIVITIES_PER_PAGE);
    const pageCards = new Set(pageCardList);
    allCards.forEach((card) => {
      card.style.display = pageCards.has(card) ? '' : 'none';
    });
    pageCardList.forEach((card, i) => assignDeferredImage(card.querySelector('img[data-src]'), i === 0));

    if (countEl) {
      const isFiltered = active.year !== '전체' || active.field !== '전체';
      countEl.textContent = isFiltered
        ? allActivities.length + '건 중 ' + totalMatching + '건'
        : '총 ' + totalMatching + '건';
    }

    grid.style.display = totalMatching > 0 ? 'grid' : 'none';
    if (noResultsEl) noResultsEl.style.display = totalMatching > 0 ? 'none' : 'flex';

    renderPagination(totalPages);
    syncChips();
    updateResetState();
    writeUrlState(keepHash);

    if (scroll) scrollToRecordsTop();
    restorePaginationFocus();
  }

  // "필터 초기화" is only meaningful when at least one filter is narrowed —
  // when everything is on 전체 it's disabled and visually quiet, and it
  // brightens the moment a year or field filter is active.
  function updateResetState() {
    const hasActiveFilter = active.year !== '전체' || active.field !== '전체';
    document.querySelectorAll('.filter-reset').forEach((btn) => {
      btn.disabled = !hasActiveFilter;
      btn.classList.toggle('is-active', hasActiveFilter);
    });
  }

  function goToPage(page) {
    currentPage = page;
    render({ scroll: true });
  }

  function applyFilters() {
    currentPage = 1;
    render();
  }

  function setFilter(group, value) {
    active[group] = value;
    applyFilters();
  }

  function resetFilters() {
    active.year = '전체';
    active.field = '전체';
    applyFilters();
  }

  function wireFilterControls() {
    // Chips are (re)built from data, so listen on the rows, not on each chip.
    [yearChipRow, fieldChipRow].forEach((row) => {
      if (!row) return;
      row.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        setFilter(chip.dataset.group, chip.dataset.value);
      });
    });

    // A card's field tag applies that field as the filter.
    grid.addEventListener('click', (e) => {
      const tag = e.target.closest('[data-field-link]');
      if (!tag) return;
      setFilter('field', tag.getAttribute('data-field-link'));
      scrollToRecordsTop();
    });

    // Both the in-filter "필터 초기화" capsule and the one inside the empty
    // "결과 없음" state clear year + field back to 전체 and return to page 1.
    document.querySelectorAll('.reset-link, .filter-reset').forEach((link) => {
      link.addEventListener('click', resetFilters);
    });
  }

  function wirePagination() {
    if (!paginationEl) return;
    paginationEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      const page = parseInt(btn.dataset.page, 10);
      if (!page || page === currentPage) return;
      pendingFocus = btn.classList.contains('page-prev') ? 'prev' : (btn.classList.contains('page-next') ? 'next' : 'page');
      goToPage(page);
    });
  }

  // Deep link (#a-<id>): make sure the target card's page is the one shown,
  // then scroll to it and highlight it briefly. If the card doesn't match the
  // current filters it stays hidden and the link degrades to a plain filtered
  // list.
  function revealTarget(id) {
    if (!id) return false;
    const card = document.getElementById('a-' + id);
    if (!card) return false;
    const matching = matchingCards();
    const index = matching.indexOf(card);
    if (index === -1) return false;
    currentPage = Math.floor(index / ACTIVITIES_PER_PAGE) + 1;
    render({ keepHash: true });
    card.classList.add('is-target');
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    card.focus({ preventScroll: true });
    setTimeout(() => card.classList.remove('is-target'), 4000);
    return true;
  }

  async function init() {
    wireFilterControls();
    wirePagination();
    try {
      const data = await fetchSiteContent();

      const titleEl = document.querySelector('.records-title');
      if (titleEl) titleEl.textContent = getSiteCopy(data.settings, 'records_page_title');
      const introEl = document.querySelector('.records-intro');
      if (introEl) introEl.textContent = getSiteCopy(data.settings, 'records_page_description');
      applyGlobalSiteCopy(data.settings);

      // Canonical order shared with the admin list (site-data.js): year
      // descending, then the admin-controlled sort_order ascending within a
      // year, then created_at / id as tiebreakers.
      allActivities = sortActivitiesForDisplay(data.activities);
      renderChips();
      grid.innerHTML = allActivities.map(recordCardHtml).join('');

      const state = readUrlState();
      if (state.year && hasChip('year', state.year)) active.year = state.year;
      if (state.field && hasChip('field', state.field)) active.field = state.field;
      currentPage = state.page;

      if (!revealTarget(state.id)) render({ keepHash: false });
    } catch (err) {
      grid.innerHTML = '<p class="content-error">' + escHtml(describeSupabaseError(err)) + '</p>';
      if (countEl) countEl.textContent = '';
    }
  }

  init();
})();
