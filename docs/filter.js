(async function () {
  const statusEl = document.getElementById("status");
  const dateInputEl = document.getElementById("date-picker");
  const resultsEl = document.getElementById("results");
  const moreHeadingEl = document.getElementById("more-heading");
  const shortsHeadingEl = document.getElementById("shorts-heading");
  const shortsResultsEl = document.getElementById("shorts-results");

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

  const PLAY_ICON = `
    <span class="play-hint">
      <svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"></path></svg>
    </span>`;

  let byDay = null;
  let allEntries = [];
  let itemEls = [];
  let centerIndex = 0;
  let playingIndex = null;

  // Default the picker to today, then load today's videos as soon as the
  // dataset arrives. Picking a different date just re-runs the same render
  // path with a different day's entries.
  const initialDate = new Date();
  dateInputEl.value = toInputValue(initialDate);

  try {
    const res = await fetch("data/videos-by-day.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load dataset (${res.status})`);
    byDay = await res.json();
    loadForDate(initialDate);
  } catch (err) {
    console.error(err);
    statusEl.hidden = false;
    statusEl.textContent = "Couldn't load the video data right now — try refreshing.";
  }

  dateInputEl.addEventListener("change", () => {
    if (!byDay || !dateInputEl.value) return;
    // Parse the yyyy-mm-dd value as local time rather than UTC, so the
    // chosen day can't shift across a timezone boundary.
    const [y, m, d] = dateInputEl.value.split("-").map(Number);
    loadForDate(new Date(y, m - 1, d));
  });

  carouselPrevEl.addEventListener("click", () => goTo(centerIndex - 1));
  carouselNextEl.addEventListener("click", () => goTo(centerIndex + 1));

  carouselWrapEl.tabIndex = 0;
  carouselWrapEl.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") goTo(centerIndex - 1);
    if (event.key === "ArrowRight") goTo(centerIndex + 1);
  });

  setupSwipe();
  window.addEventListener("resize", () => {
    if (allEntries.length > 0) {
      setViewportHeight();
      updatePositions();
    }
  });

  function loadForDate(date) {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const entries = byDay[`${mm}-${dd}`] || [];
    render(entries);
  }

  // Clears whatever was on screen for the previous date, then builds the
  // carousel/grid/shorts for the new one. Safe to call repeatedly as the
  // picker changes.
  function render(entries) {
    stopPlayback();
    carouselTrackEl.innerHTML = "";
    itemEls = [];
    allEntries = [];
    centerIndex = 0;
    playingIndex = null;

    carouselWrapEl.hidden = true;
    currentInfoEl.hidden = true;
    currentViewsEl.hidden = true;
    currentDescEl.hidden = true;
    moreHeadingEl.hidden = true;
    shortsHeadingEl.hidden = true;
    resultsEl.innerHTML = "";
    shortsResultsEl.innerHTML = "";
    statusEl.hidden = true;

    if (entries.length === 0) {
      resultsEl.innerHTML = `
        <p class="empty-state">
          No Yogscast main-channel videos were uploaded on this date &mdash;
          try another day.
        </p>`;
      return;
    }

    // Shorts don't go in the carousel or the "Also on this day" grid above
    // (those are for main-channel long-form uploads) — they get their own
    // section further down instead. See renderShorts().
    const regulars = entries.filter((v) => !v.isShort);
    const shorts = entries.filter((v) => v.isShort);

    if (regulars.length > 0) {
      allEntries = regulars;

      itemEls = allEntries.map((video, idx) => buildCarouselItem(video, idx));
      itemEls.forEach((el) => carouselTrackEl.appendChild(el));

      carouselWrapEl.hidden = false;
      currentInfoEl.hidden = false;
      currentViewsEl.hidden = false;
      currentDescEl.hidden = false;
      carouselPrevEl.hidden = allEntries.length <= 1;
      carouselNextEl.hidden = allEntries.length <= 1;

      const startVideo = pickMostViewed(allEntries);
      const startIndex = allEntries.findIndex((v) => v.videoId === startVideo.videoId);

      setViewportHeight();
      goTo(startIndex === -1 ? 0 : startIndex);
    }

    renderShorts(shorts);
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
    if (n === 0) return;
    centerIndex = ((idx % n) + n) % n;
    stopPlayback();
    refreshAll();
  }

  // Centers AND plays a video immediately (used on first load and when a
  // card is clicked in the "Also on this day" grid below).
  function playAt(idx) {
    const n = allEntries.length;
    if (n === 0) return;
    centerIndex = ((idx % n) + n) % n;
    if (playingIndex !== null && playingIndex !== centerIndex) {
      renderThumb(itemEls[playingIndex], allEntries[playingIndex]);
    }
    playingIndex = centerIndex;
    renderPlayer(itemEls[centerIndex], allEntries[centerIndex]);
    refreshAll();
  }

  function stopPlayback() {
    if (playingIndex !== null && itemEls[playingIndex]) {
      renderThumb(itemEls[playingIndex], allEntries[playingIndex]);
    }
    playingIndex = null;
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
    if (n === 0) return;
    const w = getItemWidth();

    itemEls.forEach((el, idx) => {
      let diff = idx - centerIndex;
      if (diff > n / 2) diff -= n;
      if (diff < -n / 2) diff += n;

      const abs = Math.abs(diff);
      const visible = abs <= 1;
      // Side neighbours are bigger and more opaque than before, and the
      // carousel wrap is full-bleed (see .carousel-wrap in style.css), so
      // there's plenty of room either side of the large centered video.
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
    if (!video) return;
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

  // Shorts get their own section below "Also on this day" rather than being
  // mixed into the carousel/grid above. Each card links straight out to the
  // Short on YouTube — there's no carousel here to play them inline.
  function renderShorts(shorts) {
    shortsResultsEl.innerHTML = "";

    if (shorts.length === 0) {
      shortsHeadingEl.hidden = true;
      return;
    }

    shortsHeadingEl.hidden = false;
    const grid = document.createElement("div");
    grid.className = "year-grid";
    for (const video of shorts) {
      grid.appendChild(
        renderCard(video, {
          inlinePlay: false,
          href: `https://www.youtube.com/shorts/${video.videoId}`,
        })
      );
    }
    shortsResultsEl.appendChild(grid);
  }

  // `inlinePlay` (default true, used by the "Also on this day" grid) makes
  // left-click center + play the video in the carousel above instead of
  // navigating away. Shorts (see renderShorts) pass inlinePlay: false since
  // there's no carousel to play them in, so their cards just open on
  // YouTube like a normal link.
  function renderCard(video, { inlinePlay = true, href } = {}) {
    const a = document.createElement("a");
    a.className = "video-card";
    a.href = href || `https://www.youtube.com/watch?v=${video.videoId}`;
    a.rel = "noopener noreferrer";
    if (!inlinePlay) a.target = "_blank";

    if (inlinePlay) {
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
    }

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

  function firstLine(description) {
    if (!description) return "";
    const line = description.split(/\r?\n/).find((l) => l.trim().length > 0);
    return line ? line.trim() : "";
  }

  function formatViewCount(viewCount) {
    return (viewCount || 0).toLocaleString();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function toInputValue(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
})();
