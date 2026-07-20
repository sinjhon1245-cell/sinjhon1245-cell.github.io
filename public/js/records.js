(function () {
  const ACTIVITIES_PER_PAGE = 6;

  const grid = document.getElementById('records-grid');
  const countEl = document.querySelector('.records-count');
  const noResultsEl = document.querySelector('.no-results');
  const paginationEl = document.getElementById('records-pagination');

  const active = { year: '전체', field: '전체' };
  let allActivities = [];
  let currentPage = 1;

  // Cards for all activities are built up front, but only the current
  // page's 6 <img> elements ever get a real src (assigned on demand by
  // assignCardImage, called from render()) — the other pages' images are
  // never requested until the user actually pages to them. data-src holds the
  // intended URL until then; decoding is async either way so a large photo
  // never blocks the main thread. Both a real admin-uploaded photo and a
  // field default thumbnail are a single image (no responsive srcset).
  function recordCardHtml(a) {
    const imageResult = resolveActivityImage(a);
    let imageHtml = '';
    if (imageResult) {
      // A real photo keeps its uploaded alt (the activity title); a default
      // thumbnail is purely decorative, so alt="" + aria-hidden. Both carry
      // data-field so handleActivityImageError can fall back to the field
      // default if the image (a real photo, most likely) fails to load.
      const isDefault = imageResult.type === 'default';
      const alt = isDefault ? '' : escHtml(a.title);
      const frameClass = 'img-frame rounded-14 record-frame' + (isDefault ? ' is-default-thumb' : '');
      imageHtml = '<div class="' + frameClass + '"><img data-src="' + escHtml(imageResult.url) +
        '" alt="' + alt + '" data-field="' + escHtml(a.field) + '" decoding="async"' +
        (isDefault ? ' aria-hidden="true"' : '') + ' onerror="handleActivityImageError(this)"></div>';
    }
    const description = (a.description || '').trim();
    const descHtml = description ? '<p class="record-desc">' + escHtml(description) + '</p>' : '';
    return '' +
      '<article class="record-card" data-year="' + escHtml(a.year) + '" data-field="' + escHtml(a.field) + '">' +
        imageHtml +
        '<div class="record-meta">' +
          '<span class="record-year">' + escHtml(a.year) + '</span><span>·</span><span>' + escHtml(a.type) + '</span><span>·</span><span>' + escHtml(a.role) + '</span>' +
        '</div>' +
        '<h3>' + escHtml(a.title) + '</h3>' +
        '<div class="record-tags"><span class="record-field">' + escHtml(a.field) + '</span></div>' +
        descHtml +
      '</article>';
  }

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

    let html = '<button type="button" class="page-btn page-nav" data-page="' + (currentPage - 1) + '"' +
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

    html += '<button type="button" class="page-btn page-nav" data-page="' + (currentPage + 1) + '"' +
      (nextDisabled ? ' disabled' : '') + '>다음</button>';

    paginationEl.innerHTML = html;
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

  // Assigns the real image src/srcset/sizes the first time a card becomes
  // part of the visible page (display is set before this runs, so native
  // lazy loading can correctly see the element as laid out rather than
  // display:none). Whether a card actually falls within the first screen is
  // measured, not assumed — desktop's 3-column row and mobile's 1-column
  // stack put a different number of the page's 6 cards above the fold, so a
  // fixed count would either waste eager-loading priority on offscreen
  // images or miss ones the user can already see. Only the first on-screen
  // card also gets fetchpriority=high, as the page's likely LCP image.
  // Already-assigned cards (revisited pages) are left alone — checking the
  // src attribute (not data-src) means a repeat visit is a no-op, not a
  // re-fetch.
  function assignCardImage(card, isFirstOfPage) {
    const img = card.querySelector('img[data-src]');
    if (!img || img.getAttribute('src')) return;

    const rect = card.getBoundingClientRect();
    const onFirstScreen = rect.top < window.innerHeight && rect.bottom > 0;

    img.loading = onFirstScreen ? 'eager' : 'lazy';
    if (onFirstScreen && isFirstOfPage) img.setAttribute('fetchpriority', 'high');

    const sizes = img.getAttribute('data-sizes');
    if (sizes) img.setAttribute('sizes', sizes);
    const srcset = img.getAttribute('data-srcset');
    if (srcset) img.setAttribute('srcset', srcset);
    img.src = img.dataset.src;
  }

  function render(opts) {
    const scroll = !!(opts && opts.scroll);

    const allCards = Array.from(grid.querySelectorAll('.record-card'));
    const matching = allCards.filter((card) =>
      (active.year === '전체' || card.dataset.year === active.year) &&
      (active.field === '전체' || card.dataset.field === active.field)
    );

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
    pageCardList.forEach((card, i) => assignCardImage(card, i === 0));

    if (countEl) {
      const isFiltered = active.year !== '전체' || active.field !== '전체';
      countEl.textContent = isFiltered
        ? allActivities.length + '건 중 ' + totalMatching + '건'
        : '총 ' + totalMatching + '건';
    }

    grid.style.display = totalMatching > 0 ? 'grid' : 'none';
    if (noResultsEl) noResultsEl.style.display = totalMatching > 0 ? 'none' : 'flex';

    renderPagination(totalPages);
    updateResetState();

    if (scroll) scrollToRecordsTop();
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

  function wireFilterControls() {
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const group = chip.dataset.group;
        const value = chip.dataset.value;
        active[group] = value;
        document.querySelectorAll('.chip[data-group="' + group + '"]').forEach((c) => {
          c.classList.toggle('active', c === chip);
        });
        applyFilters();
      });
    });

    // Both the in-filter "필터 초기화" capsule and the one inside the empty
    // "결과 없음" state clear year + field back to 전체 and return to page 1.
    document.querySelectorAll('.reset-link, .filter-reset').forEach((link) => {
      link.addEventListener('click', () => {
        active.year = '전체';
        active.field = '전체';
        document.querySelectorAll('.chip').forEach((c) => {
          c.classList.toggle('active', c.dataset.value === '전체');
        });
        applyFilters();
      });
    });
  }

  function wirePagination() {
    if (!paginationEl) return;
    paginationEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      const page = parseInt(btn.dataset.page, 10);
      if (!page || page === currentPage) return;
      goToPage(page);
    });
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
      grid.innerHTML = allActivities.map(recordCardHtml).join('');
      render();
    } catch (err) {
      grid.innerHTML = '<p class="content-error">' + escHtml(describeSupabaseError(err)) + '</p>';
      if (countEl) countEl.textContent = '';
    }
  }

  init();
})();
