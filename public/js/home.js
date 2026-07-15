(function () {
  const featuredGrid = document.getElementById('featured-grid');
  const specialtiesList = document.getElementById('specialties-list');
  const timelineBody = document.getElementById('timeline-body');

  function featuredCardHtml(a, index) {
    const num = String(index + 1).padStart(2, '0');
    return '' +
      '<article class="featured-card">' +
        '<div class="img-frame featured-frame">' + imgFrameHtml(a.image_url, a.title, '대표 활동 사진 ' + (index + 1)) + '</div>' +
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

  async function init() {
    try {
      const data = await fetchSiteContent();

      if (data.settings) applyRemoteImage('hero-photo', data.settings.hero_image_url);

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

  init();
})();
