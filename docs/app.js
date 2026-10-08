(async function () {
  const statusEl = document.getElementById("status");
  const todayLabelEl = document.getElementById("today-label");
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

  // Optional: if this page is served alongside an older cached index.html
  // without the autoplay switch, everything below just treats autoplay as on.
  const autoplayWrapEl = document.getElementById("autoplay-wrap");
  const autoplayToggleEl = document.getElementById("autoplay-toggle");

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

  // Autoplay: when the playing video finishes, slide the carousel on to the
  // next video and start it, working through the whole day once. Remembered
  // per browser via localStorage (falls back to on if that's unavailable).
  let autoplayOn = readAutoplayPref();
  // Videos already played in the current autoplay run, so it stops after
  // going all the way round the day rather than looping forever.
  let autoplayRun = new Set();

  try {
    // "no-cache" = always check for a newer copy, but if it hasn't changed
    // since last time, reuse the one already downloaded instead of fetching
    // all ~2.7MB again.
    const res = await fetch("data/videos-by-day.json", { cache: "no-cache" });
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

    // Shorts don't go in the carousel or the "Also on this day" grid above
    // (those are for main-channel long-form uploads) — they get their own
    // section further down instead. See renderShorts().
    const regulars = entries.filter((v) => !v.isShort);
    const shorts = entries.filter((v) => v.isShort);

    if (regulars.length > 0) {
      allEntries = regulars;

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

      // Autoplay only makes sense with more than one video to move on to.
      if (autoplayWrapEl && autoplayToggleEl && allEntries.length > 1) {
        autoplayWrapEl.hidden = false;
        autoplayToggleEl.checked = autoplayOn;
        autoplayToggleEl.addEventListener("change", () => {
          autoplayOn = autoplayToggleEl.checked;
          saveAutoplayPref(autoplayOn);
          track("autoplay_toggle", { enabled: autoplayOn, page_type: "home" });
        });
      }

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

  // enablejsapi lets the page hear back from the embedded player (via the
  // YouTube IFrame API) so it knows when a video has finished — that's what
  // drives autoplay.
  function renderPlayer(el, video, idx) {
    const origin = encodeURIComponent(window.location.origin);
    el.innerHTML = `
      <iframe
        src="https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&enablejsapi=1&origin=${origin}"
        title="${escapeHtml(video.title)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    `;
    watchForEnd(el.querySelector("iframe"), idx);
  }

  // Hooks the YouTube IFrame API onto a freshly-inserted player so we get a
  // callback when it finishes. If the API can't load (blocked, offline...),
  // playback still works — it just won't move on by itself.
  function watchForEnd(iframe, idx) {
    loadYouTubeApi()
      .then((YT) => {
        // The visitor may have moved on while the API was loading.
        if (!iframe.isConnected || playingIndex !== idx) return;
        new YT.Player(iframe, {
          events: {
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED) onVideoEnded(idx);
            },
          },
        });
      })
      .catch((err) => console.warn("Autoplay unavailable:", err));
  }

  let youTubeApiPromise = null;
  function loadYouTubeApi() {
    if (youTubeApiPromise) return youTubeApiPromise;
    youTubeApiPromise = new Promise((resolve, reject) => {
      if (window.YT && window.YT.Player) {
        resolve(window.YT);
        return;
      }
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previous === "function") previous();
        resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => reject(new Error("Couldn't load the YouTube player API"));
      document.head.appendChild(script);
    });
    return youTubeApiPromise;
  }

  // A video finished: if autoplay is on, slide on to the next one in the
  // carousel (same direction as the right arrow) and start it — unless that
  // would mean replaying something from this run, i.e. we've been all the way
  // round the day.
  function onVideoEnded(idx) {
    if (playingIndex !== idx) return;
    track("video_complete", {
      video_id: allEntries[idx].videoId,
      video_title: clip(allEntries[idx].title),
      page_type: "home",
    });
    if (!autoplayOn || allEntries.length < 2) return;
    const nextIdx = (idx + 1) % allEntries.length;
    if (autoplayRun.has(allEntries[nextIdx].videoId)) return;
    autoplayRun.add(allEntries[nextIdx].videoId);
    trackPlay(nextIdx, "autoplay");
    playAt(nextIdx);
  }

  function trackPlay(idx, source) {
    track("video_play", {
      video_id: allEntries[idx].videoId,
      video_title: clip(allEntries[idx].title),
      page_type: "home",
      play_source: source,
    });
  }

  // Starting a video by hand begins a fresh autoplay run from that video.
  function startManualPlay(idx) {
    autoplayRun = new Set([allEntries[idx].videoId]);
    trackPlay(idx, "click");
    playAt(idx);
  }

  function readAutoplayPref() {
    try {
      return localStorage.getItem("autoplay") !== "off";
    } catch (err) {
      return true;
    }
  }

  function saveAutoplayPref(on) {
    try {
      localStorage.setItem("autoplay", on ? "on" : "off");
    } catch (err) {}
  }

  function onItemClick(idx) {
    if (idx === centerIndex) {
      if (playingIndex !== idx) startManualPlay(idx);
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
    renderPlayer(itemEls[centerIndex], allEntries[centerIndex], centerIndex);
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
        if (idx !== -1) startManualPlay(idx);
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

  // Sends a Google Analytics event (the gtag snippet is in the page <head>).
  // Does nothing if analytics didn't load — blocked, offline, or the visitor
  // switched it off on the About page.
  function track(name, params) {
    try {
      if (typeof window.gtag === "function") window.gtag("event", name, params || {});
    } catch (err) {}
  }

  // GA4 caps text parameters at 100 characters.
  function clip(text) {
    return String(text || "").slice(0, 100);
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
