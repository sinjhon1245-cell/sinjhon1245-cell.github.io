(function () {
  const ACTIVITIES_PER_PAGE = 6;

  const grid = document.getElementById('records-grid');
  const countEl = document.querySelector('.records-count');
  const noResultsEl = document.querySelector('.no-results');
  const paginationEl = document.getElementById('records-pagination');

  const active = { year: '전체', field: '전체' };
  let allActivities = [];
  let currentPage = 1;

  function recordCardHtml(a) {
    const imageUrl = resolveActivityImage(a);
    const imageHtml = imageUrl
      ? '<div class="img-frame rounded-14 record-frame"><img src="' + escHtml(imageUrl) + '" alt="' + escHtml(a.title) + '"></div>'
      : '';
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
    const pageCards = new Set(matching.slice(start, start + ACTIVITIES_PER_PAGE));
    allCards.forEach((card) => {
      card.style.display = pageCards.has(card) ? '' : 'none';
    });

    if (countEl) {
      const isFiltered = active.year !== '전체' || active.field !== '전체';
      countEl.textContent = isFiltered
        ? allActivities.length + '건 중 ' + totalMatching + '건'
        : '총 ' + totalMatching + '건';
    }

    grid.style.display = totalMatching > 0 ? 'grid' : 'none';
    if (noResultsEl) noResultsEl.style.display = totalMatching > 0 ? 'none' : 'flex';

    renderPagination(totalPages);

    if (scroll) scrollToRecordsTop();
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

    document.querySelectorAll('.reset-link').forEach((link) => {
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

      allActivities = data.activities.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      grid.innerHTML = allActivities.map(recordCardHtml).join('');
      render();
    } catch (err) {
      grid.innerHTML = '<p class="content-error">' + escHtml(describeSupabaseError(err)) + '</p>';
      if (countEl) countEl.textContent = '';
    }
  }

  init();
})();
