(function () {
  const grid = document.getElementById('records-grid');
  const countEl = document.querySelector('.records-count');
  const noResultsEl = document.querySelector('.no-results');

  const active = { year: '전체', field: '전체' };
  let allActivities = [];

  function recordCardHtml(a) {
    return '' +
      '<article class="record-card" data-year="' + escHtml(a.year) + '" data-field="' + escHtml(a.field) + '">' +
        '<div class="img-frame rounded-14 record-frame">' + imgFrameHtml(a.image_url, a.title, '활동 사진') + '</div>' +
        '<div class="record-meta">' +
          '<span class="record-year">' + escHtml(a.year) + '</span><span>·</span><span>' + escHtml(a.type) + '</span><span>·</span><span>' + escHtml(a.role) + '</span>' +
        '</div>' +
        '<h3>' + escHtml(a.title) + '</h3>' +
        '<div class="record-tags"><span class="record-field">' + escHtml(a.field) + '</span></div>' +
      '</article>';
  }

  function applyFilters() {
    const cards = grid.querySelectorAll('.record-card');
    let visible = 0;
    cards.forEach((card) => {
      const matches =
        (active.year === '전체' || card.dataset.year === active.year) &&
        (active.field === '전체' || card.dataset.field === active.field);
      card.style.display = matches ? '' : 'none';
      if (matches) visible++;
    });
    if (countEl) countEl.textContent = '총 ' + visible + '건';
    grid.style.display = visible > 0 ? 'grid' : 'none';
    if (noResultsEl) noResultsEl.style.display = visible > 0 ? 'none' : 'flex';
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

  async function init() {
    wireFilterControls();
    try {
      const data = await fetchSiteContent();
      allActivities = data.activities.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      grid.innerHTML = allActivities.map(recordCardHtml).join('');
      applyFilters();
    } catch (err) {
      grid.innerHTML = '<p class="content-error">' + escHtml(describeSupabaseError(err)) + '</p>';
      if (countEl) countEl.textContent = '';
    }
  }

  init();
})();
