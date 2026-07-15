(function () {
  const interestsList = document.getElementById('interests-list');

  async function init() {
    try {
      const data = await fetchSiteContent();

      if (data.settings) applyRemoteImage('about-portrait-photo', data.settings.about_portrait_url);

      const titleEl = document.querySelector('.about-intro h1');
      if (titleEl) titleEl.textContent = getSiteCopy(data.settings, 'about_page_title');
      const introEl = document.querySelector('.about-intro-body');
      if (introEl) introEl.textContent = getSiteCopy(data.settings, 'about_intro_text');
      applyGlobalSiteCopy(data.settings);

      interestsList.innerHTML = data.interests.length
        ? data.interests.map((i) => '<span>' + escHtml(i.label) + '</span>').join('')
        : '<span class="content-empty">아직 등록된 관심 주제가 없습니다.</span>';
    } catch (err) {
      interestsList.innerHTML = '<span class="content-error">' + escHtml(describeSupabaseError(err)) + '</span>';
    }
  }

  init();
})();
