(async function () {
  const statusEl = document.getElementById("status");
  const todayLabelEl = document.getElementById("today-label");
  const resultsEl = document.getElementById("results");
  const moreHeadingEl = document.getElementById("more-heading");

  const currentInfoEl = document.getElementById("current-info");
  const currentYearEl = document.getElementById("current-year");
  const currentTitleEl = document.getElementById("current-title");
  const currentViewsEl = document.getElementById("current-views");
  const currentDescEl = document.getElementById("current-desc");

  const carouselWrapEl = document.getElementById("carousel-wrap");
  const carouselViewportEl = document.getElementById("carousel-viewport");
  const carouselTrackEl = document.getElementById("carousel-track");
  const carouselPrevEl = document.getElementById("carousel-prev");
  const carouselNextEl = document.getElementById("carousel-next");

  initThemeToggle();

  const PLAY_ICON = `
    <span class="play-hint">
      <svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"></path></svg>
    </span>`;

  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayKey = `${mm}-${dd}`;

  todayLabelEl.textContent = `On the ${ordinal(today.getDate())} of ${today.toLocaleDateString(undefined, { month: "long" })}…`;

  let allEntries = [];
  let itemEls = [];
  let centerIndex = 0;
  let playingIndex = null;

  try {
    const res = await fetch("data/videos-by-day.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load dataset (${res.status})`);
    const byDay = await res.json();

    const entries = byDay[todayKey] || [];
    init(entries);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't load the video data right now — try refreshing.";
  }

  function init(entries) {
    statusEl.remove();

    if (entries.length === 0) {
      resultsEl.innerHTML = `
        <p class="empty-state">
          No Yogscast main-channel videos were uploaded on this date &mdash;
          at least not yet. Check back tomorrow!
        </p>`;
      return;
    }

    allEntries = entries;

    // Build the carousel's DOM once; only positions/content get mutated
    // afterwards so the CSS transition animates smoothly as you browse.
    itemEls = allEntries.map((video, idx) => buildCarouselItem(video, idx));
    itemEls.forEach((el) => carouselTrackEl.appendChild(el));

    carouselWrapEl.hidden = false;
    currentInfoEl.hidden = false;
    currentViewsEl.hidden = false;
    currentDescEl.hidden = false;

    carouselPrevEl.addEventListener("click", () => goTo(centerIndex - 1));
    carouselNextEl.addEventListener("click", () => goTo(centerIndex + 1));
    carouselPrevEl.hidden = allEntries.length <= 1;
    carouselNextEl.hidden = allEntries.length <= 1;

    carouselWrapEl.tabIndex = 0;
    carouselWrapEl.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") goTo(centerIndex - 1);
      if (event.key === "ArrowRight") goTo(centerIndex + 1);
    });

    setupSwipe();
    window.addEventListener("resize", () => {
      setViewportHeight();
      updatePositions();
    });

    const startVideo = pickMostViewed(allEntries);
    const startIndex = allEntries.findIndex((v) => v.videoId === startVideo.videoId);

    setViewportHeight();
    // Centers the headline pick on load but does NOT auto-play it — same
    // as browsing the carousel afterwards, you click the centered video to
    // actually start playing it.
    goTo(startIndex === -1 ? 0 : startIndex);
  }

  function pickMostViewed(entries) {
    return [...entries].sort((a, b) => {
      const byViews = (b.viewCount || 0) - (a.viewCount || 0);
      return byViews !== 0 ? byViews : b.year - a.year;
    })[0];
  }

  function buildCarouselItem(video, idx) {
    const el = document.createElement("div");
    el.className = "carousel-item";
    el.dataset.index = String(idx);
    renderThumb(el, video);
    el.addEventListener("click", () => onItemClick(idx));
    return el;
  }

  function renderThumb(el, video) {
    el.innerHTML = `
      <img src="https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg" loading="lazy" alt="" />
      <span class="year-badge">${video.year}</span>
      ${PLAY_ICON}
    `;
  }

  function renderPlayer(el, video) {
    el.innerHTML = `
      <iframe
        src="https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1"
        title="${escapeHtml(video.title)}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    `;
  }

  function onItemClick(idx) {
    if (idx === centerIndex) {
      if (playingIndex !== idx) playAt(idx);
      return;
    }
    goTo(idx);
  }

  // Moves a new video to the center slot. Does NOT start playback — browsing
  // the carousel (arrows, swipe, or clicking a side item) only previews;
  // you click the centered video itself to actually play it.
  function goTo(idx) {
    const n = allEntries.length;
    centerIndex = ((idx % n) + n) % n;
    stopPlayback();
    refreshAll();
  }

  // Centers AND plays a video immediately (used on first load and when a
  // card is clicked in the "Also on this day" grid below).
  function playAt(idx) {
    const n = allEntries.length;
    centerIndex = ((idx % n) + n) % n;
    if (playingIndex !== null && playingIndex !== centerIndex) {
      renderThumb(itemEls[playingIndex], allEntries[playingIndex]);
    }
    playingIndex = centerIndex;
    renderPlayer(itemEls[centerIndex], allEntries[centerIndex]);
    refreshAll();
  }

  function stopPlayback() {
    if (playingIndex !== null) {
      renderThumb(itemEls[playingIndex], allEntries[playingIndex]);
      playingIndex = null;
    }
  }

  function refreshAll() {
    updatePositions();
    updateCurrentInfo();
    renderGrid();
  }

  function getItemWidth() {
    return itemEls[0] ? itemEls[0].offsetWidth : 320;
  }

  function setViewportHeight() {
    const w = getItemWidth();
    carouselViewportEl.style.height = `${Math.round((w * 9) / 16) + 16}px`;
  }

  function updatePositions() {
    const n = allEntries.length;
    const w = getItemWidth();

    itemEls.forEach((el, idx) => {
      let diff = idx - centerIndex;
      if (diff > n / 2) diff -= n;
      if (diff < -n / 2) diff += n;

      const abs = Math.abs(diff);
      const visible = abs <= 1;
      // Side neighbours are bigger and more opaque than before, and the
      // carousel wrap is now full-bleed (see .carousel-wrap in style.css),
      // so there's plenty of room either side of the large centered video.
      const scale = diff === 0 ? 1 : 0.62;
      const offset = diff * w * 0.64;
      const opacity = diff === 0 ? 1 : abs === 1 ? 0.85 : 0;

      el.style.transform = `translate(-50%, -50%) translateX(${offset}px) scale(${scale})`;
      el.style.opacity = String(opacity);
      el.style.zIndex = String(10 - abs);
      el.style.pointerEvents = visible ? "auto" : "none";
      el.classList.toggle("is-center", diff === 0);
    });
  }

  function updateCurrentInfo() {
    const video = allEntries[centerIndex];
    currentYearEl.textContent = video.year;
    currentTitleEl.textContent = video.title;
    currentViewsEl.textContent = `${formatViewCount(video.viewCount)} views`;
    currentDescEl.textContent = firstLine(video.description);
  }

  function setupSwipe() {
    let startX = null;

    carouselViewportEl.addEventListener("pointerdown", (event) => {
      startX = event.clientX;
    });
    carouselViewportEl.addEventListener("pointerup", (event) => {
      if (startX === null) return;
      const delta = event.clientX - startX;
      startX = null;
      if (Math.abs(delta) < 40) return;
      if (delta < 0) goTo(centerIndex + 1);
      else goTo(centerIndex - 1);
    });
    carouselViewportEl.addEventListener("pointercancel", () => {
      startX = null;
    });
  }

  // The grid always excludes whichever video is currently centered in the
  // carousel above, so there's no duplicate between the two.
  function renderGrid() {
    const rest = allEntries.filter((_, idx) => idx !== centerIndex);

    resultsEl.innerHTML = "";
    if (rest.length === 0) {
      moreHeadingEl.hidden = true;
      return;
    }

    moreHeadingEl.hidden = false;
    const grid = document.createElement("div");
    grid.className = "year-grid";
    for (const video of rest) {
      grid.appendChild(renderCard(video));
    }
    resultsEl.appendChild(grid);
  }

  function renderCard(video) {
    const a = document.createElement("a");
    a.className = "video-card";
    a.href = `https://www.youtube.com/watch?v=${video.videoId}`;
    a.rel = "noopener noreferrer";

    // Left-click plays the video right here in the carousel instead of
    // navigating away. Cmd/ctrl/shift-click (or middle-click) still opens
    // it on YouTube in a new tab, since the href is left intact.
    a.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      const idx = allEntries.findIndex((v) => v.videoId === video.videoId);
      if (idx !== -1) playAt(idx);
      carouselWrapEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const publishedDate = new Date(video.publishedAt);
    const dateLabel = publishedDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    a.innerHTML = `
      <div class="thumb-wrap">
        <img
          src="https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg"
          loading="lazy"
          alt=""
        />
        <span class="year-badge">${video.year}</span>
      </div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(video.title)}</p>
        <p class="card-date">${dateLabel}</p>
      </div>
    `;

    return a;
  }

  function ordinal(n) {
    const j = n % 10;
    const k = n % 100;
    if (j === 1 && k !== 11) return `${n}st`;
    if (j === 2 && k !== 12) return `${n}nd`;
    if (j === 3 && k !== 13) return `${n}rd`;
    return `${n}th`;
  }

  function firstLine(description) {
    if (!description) return "";
    const line = description.split(/\r?\n/).find((l) => l.trim().length > 0);
    return line ? line.trim() : "";
  }

  function formatViewCount(viewCount) {
    return (viewCount || 0).toLocaleString();
  }

  // Light/dark switch in the page header. A tiny inline script in
  // index.html already applies any saved choice before first paint (to
  // avoid a flash of the wrong theme); this just wires up the click
  // handler and keeps the switch's own visual state in sync.
  function initThemeToggle() {
    const toggleEl = document.getElementById("theme-toggle");
    if (!toggleEl) return;

    const getStoredTheme = () => {
      try {
        return localStorage.getItem("theme");
      } catch (err) {
        return null;
      }
    };

    const prefersLight =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    let theme = getStoredTheme() || (prefersLight ? "light" : "dark");

    applyTheme(theme);

    toggleEl.addEventListener("click", () => {
      theme = theme === "light" ? "dark" : "light";
      applyTheme(theme);
      try {
        localStorage.setItem("theme", theme);
      } catch (err) {}
    });

    function applyTheme(t) {
      document.documentElement.setAttribute("data-theme", t);
      toggleEl.setAttribute("aria-pressed", String(t === "light"));
      toggleEl.setAttribute("aria-label", t === "light" ? "Switch to dark mode" : "Switch to light mode");
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
