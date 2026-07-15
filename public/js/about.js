(function () {
  const interestsList = document.getElementById('interests-list');
  const careerList = document.getElementById('career-list');

  // Builds each row as real DOM nodes with .textContent (never innerHTML), so
  // a title containing "<script>" or "<img onerror=...>" can never execute —
  // it just prints as literal text, same as any other plain string.
  function renderCareers(careers) {
    if (!careerList) return;
    careerList.textContent = '';
    if (!careers.length) {
      const empty = document.createElement('span');
      empty.className = 'content-empty';
      empty.textContent = '아직 등록된 주요 이력이 없습니다.';
      careerList.appendChild(empty);
      return;
    }
    careers.forEach((c) => {
      const when = document.createElement('span');
      when.className = 'about-when';
      when.textContent = formatCareerPeriod(c);
      const title = document.createElement('span');
      title.textContent = c.title;
      careerList.appendChild(when);
      careerList.appendChild(title);
    });
  }

  async function init() {
    try {
      const data = await fetchSiteContent();

      if (data.settings) applyRemoteImage('about-portrait-photo', data.settings.about_portrait_url);

      const titleEl = document.querySelector('.about-intro h1');
      if (titleEl) titleEl.textContent = getSiteCopy(data.settings, 'about_page_title');
      const introEl = document.querySelector('.about-intro-body');
      if (introEl) introEl.textContent = getSiteCopy(data.settings, 'about_intro_text');
      applyGlobalSiteCopy(data.settings);

      // careers may not exist yet on a project that hasn't run the SQL patch —
      // in that case leave the static HTML fallback in #career-list untouched
      // rather than replacing it with an error.
      if (!data.careersError) renderCareers(data.careers);

      interestsList.innerHTML = data.interests.length
        ? data.interests.map((i) => '<span>' + escHtml(i.label) + '</span>').join('')
        : '<span class="content-empty">아직 등록된 관심 주제가 없습니다.</span>';
    } catch (err) {
      interestsList.innerHTML = '<span class="content-error">' + escHtml(describeSupabaseError(err)) + '</span>';
    }
  }

  init();
})();
