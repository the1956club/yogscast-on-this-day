(async function () {
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");
  const moreHeadingEl = document.getElementById("more-heading");
  const shortsHeadingEl = document.getElementById("shorts-heading");
  const shortsResultsEl = document.getElementById("shorts-results");

  // --- Now-playing player (single, fixed slot — not a carousel) ---
  const nowPlayingEl = document.getElementById("now-playing");
  const nowPlayingFrameEl = document.getElementById("now-playing-frame");
  const nowPlayingTitleEl = document.getElementById("now-playing-title");
  const nowPlayingMetaEl = document.getElementById("now-playing-meta");

  // --- Results toolbar: sort order + autoplay switch (under the heading) ---
  // Either may be missing if a browser has an older cached filter.html; the
  // code below copes with that (sorting stays newest-first, autoplay on).
  const toolbarEl = document.getElementById("results-toolbar");
  const sortSelectEl = document.getElementById("results-sort");
  const autoplayWrapEl = document.getElementById("autoplay-wrap");
  const autoplayToggleEl = document.getElementById("autoplay-toggle");

  // --- Date picker elements ---
  const datePickerEl = document.getElementById("date-picker");
  const dateTriggerEl = document.getElementById("date-picker-trigger");
  const dateTriggerValueEl = document.getElementById("date-picker-value");
  const datePanelEl = document.getElementById("date-picker-panel");
  const monthLabelEl = document.getElementById("date-picker-month");
  const daysGridEl = document.getElementById("date-picker-days");
  const prevMonthEl = document.getElementById("date-picker-prev");
  const nextMonthEl = document.getElementById("date-picker-next");

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  // Only used to lay out the calendar grid (which weekday a month starts on,
  // how many days it has) — no real year is ever tracked. 2028 is a leap
  // year so February always gets its 29th. Hitting "next" from December (or
  // "previous" from January) just wraps straight around.
  const GRID_YEAR = 2028;

  let byDay = null;
  // Every video across every day, flattened once up front so the game and
  // series filters can browse across all dates, not just one day at a time.
  let allVideos = [];
  // The video currently loaded in the single top player, if any (not a
  // per-card thing — every card stays a thumbnail; clicking any of them
  // just changes what's loaded here).
  let nowPlayingVideoId = null;

  // What's currently on screen, kept so the sort order can be changed
  // without re-filtering (and without stopping the video that's playing).
  let lastEntries = [];
  let lastMode = "all";
  let sortOrder = "newest";
  // The playable (non-Short) videos in the order they're shown — autoplay
  // works down this list.
  let playQueue = [];

  // Autoplay: when the top player's video finishes, start the next one in
  // the grid. Shares its on/off setting with the homepage's switch.
  let autoplayOn = readAutoplayPref();

  if (sortSelectEl) {
    sortSelectEl.value = sortOrder;
    sortSelectEl.addEventListener("change", () => {
      sortOrder = sortSelectEl.value;
      track("sort_change", { sort_order: sortOrder });
      drawResults();
    });
  }
  if (autoplayToggleEl) {
    autoplayToggleEl.checked = autoplayOn;
    autoplayToggleEl.addEventListener("change", () => {
      autoplayOn = autoplayToggleEl.checked;
      saveAutoplayPref(autoplayOn);
      track("autoplay_toggle", { enabled: autoplayOn, page_type: "filter" });
    });
  }

  // The month currently shown in the open calendar panel, vs. the month/day
  // the visitor has actually picked (null until they click a day).
  let viewMonth = new Date().getMonth();
  let selectedMonth = null;
  let selectedDay = null;

  // Only one popover (date, game or series) open at a time.
  let openPopover = null; // { panelEl, triggerEl }

  // The two tick-box pickers. Each reads one array field off every video
  // ("games" / "series", added by the data pipeline — see
  // scripts/lib/tags.js) and keeps its own set of ticked names.
  const gamePicker = createMultiPicker({
    id: "game-picker",
    field: "games",
    noneLabel: "All games",
    pluralNoun: "games",
  });
  const seriesPicker = createMultiPicker({
    id: "series-picker",
    field: "series",
    noneLabel: "All series",
    pluralNoun: "series",
  });
  const pickerRoots = [
    datePickerEl,
    gamePicker.rootEl,
    seriesPicker.rootEl,
  ];

  // Free-text title search. Every word typed has to appear somewhere in the
  // title (in any order), so "jaffa factory 2" or "israphel oasis" both work.
  // Fewer than 2 characters counts as no search, so a single stray letter
  // doesn't dump the whole archive on the page.
  const searchInputEl = document.getElementById("video-search");
  let searchTerms = [];
  let searchTimer = null;
  // Searches are reported to analytics once the visitor stops typing for a
  // moment, so "j", "ja", "jaf"... don't each count as a search.
  let searchTrackTimer = null;
  let lastTrackedSearch = "";

  if (searchInputEl) {
    searchInputEl.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const query = normaliseForSearch(searchInputEl.value);
        searchTerms = query.length >= 2 ? query.split(" ") : [];
        updateResults();

        clearTimeout(searchTrackTimer);
        if (query.length >= 2 && query !== lastTrackedSearch) {
          searchTrackTimer = setTimeout(() => {
            lastTrackedSearch = query;
            track("search", { search_term: clip(query) });
          }, 1500);
        }
      }, 200);
    });
    // Enter shouldn't do anything surprising (there's no form to submit) —
    // just apply the search straight away instead of waiting for the delay.
    searchInputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchInputEl.dispatchEvent(new Event("input"));
      }
    });
  }

  // No default date/game/series and nothing fetched-and-rendered up front —
  // a first-time visitor sees an empty page (just the pickers) until they
  // choose something.
  try {
    // "no-cache" = always check for a newer copy, but if it hasn't changed
    // since last time, reuse the one already downloaded instead of fetching
    // all ~2.7MB again.
    const res = await fetch("data/videos-by-day.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load dataset (${res.status})`);
    byDay = await res.json();
    for (const entries of Object.values(byDay)) {
      for (const video of entries) {
        video.searchText = normaliseForSearch(video.title);
        allVideos.push(video);
      }
    }
    // Newest first, so browsing a game with no date picked reads like a feed.
    allVideos.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

    gamePicker.build();
    seriesPicker.build();
    showEmptyState();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't load the video data right now — try refreshing.";
  }

  // ---------------------------------------------------------------------
  // Popover plumbing shared by all three pickers — only one panel is ever
  // open at once.
  // ---------------------------------------------------------------------

  function openPopoverFor(panelEl, triggerEl) {
    if (openPopover && openPopover.panelEl !== panelEl) closePopover();
    panelEl.hidden = false;
    // Panels hang off the left edge of their trigger; nudge one back left if
    // it would stick out past the right edge of the page content (mostly the
    // series picker, which sits furthest right), so it lines up with the
    // filter row and video grid instead.
    panelEl.style.left = "";
    const mainEl = panelEl.closest("main");
    const rightLimit = Math.min(
      window.innerWidth - 16,
      mainEl ? mainEl.getBoundingClientRect().right : Infinity
    );
    const overflow = panelEl.getBoundingClientRect().right - rightLimit;
    if (overflow > 0) panelEl.style.left = `${-overflow}px`;
    triggerEl.setAttribute("aria-expanded", "true");
    if (!openPopover) {
      document.addEventListener("click", onDocumentClick);
      document.addEventListener("keydown", onDocumentKeydown);
    }
    openPopover = { panelEl, triggerEl };
  }

  function closePopover() {
    if (!openPopover) return;
    const { panelEl, triggerEl } = openPopover;
    panelEl.hidden = true;
    triggerEl.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onDocumentKeydown);
    openPopover = null;
  }

  function onDocumentClick(event) {
    if (!openPopover) return;
    if (!pickerRoots.some((el) => el.contains(event.target))) {
      closePopover();
    }
  }

  function onDocumentKeydown(event) {
    if (event.key === "Escape" && openPopover) {
      const { triggerEl } = openPopover;
      closePopover();
      triggerEl.focus();
    }
  }

  // ---------------------------------------------------------------------
  // Date picker
  // ---------------------------------------------------------------------

  dateTriggerEl.addEventListener("click", () => {
    if (openPopover && openPopover.panelEl === datePanelEl) {
      closePopover();
      return;
    }
    viewMonth = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    renderCalendar();
    openPopoverFor(datePanelEl, dateTriggerEl);
  });

  prevMonthEl.addEventListener("click", () => {
    viewMonth = (viewMonth + 11) % 12;
    renderCalendar();
  });

  nextMonthEl.addEventListener("click", () => {
    viewMonth = (viewMonth + 1) % 12;
    renderCalendar();
  });

  function daysInMonth(monthIndex) {
    return new Date(GRID_YEAR, monthIndex + 1, 0).getDate();
  }

  function firstWeekday(monthIndex) {
    return new Date(GRID_YEAR, monthIndex, 1).getDay();
  }

  // Rebuilds the calendar panel for whichever month is currently in view.
  // Safe to call repeatedly as the visitor flicks between months.
  function renderCalendar() {
    monthLabelEl.textContent = MONTH_NAMES[viewMonth];
    daysGridEl.innerHTML = "";

    const leadingBlanks = firstWeekday(viewMonth);
    for (let i = 0; i < leadingBlanks; i++) {
      const blank = document.createElement("span");
      blank.className = "date-picker-day date-picker-day-empty";
      daysGridEl.appendChild(blank);
    }

    const total = daysInMonth(viewMonth);
    for (let day = 1; day <= total; day++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "date-picker-day";
      btn.textContent = String(day);
      if (selectedMonth === viewMonth && selectedDay === day) {
        btn.classList.add("is-selected");
      }
      btn.addEventListener("click", () => selectDate(viewMonth, day));
      daysGridEl.appendChild(btn);
    }
  }

  function selectDate(month, day) {
    selectedMonth = month;
    selectedDay = day;
    dateTriggerValueEl.textContent = `${day} ${MONTH_NAMES[month]}`;
    closePopover();
    track("filter_select", { filter_type: "date", filter_value: `${day} ${MONTH_NAMES[month]}`, selected: true });
    updateResults();
  }

  // ---------------------------------------------------------------------
  // Tick-box pickers (games and series). Same markup and behaviour for both:
  // a trigger button that opens a multi-column checklist of every name that
  // appears in `field` across the dataset, with a count beside each.
  // ---------------------------------------------------------------------

  function createMultiPicker({ id, field, noneLabel, pluralNoun }) {
    const rootEl = document.getElementById(id);
    const triggerEl = document.getElementById(`${id}-trigger`);
    const valueEl = document.getElementById(`${id}-value`);
    const panelEl = document.getElementById(`${id}-panel`);
    const listEl = document.getElementById(`${id}-list`);
    const clearEl = document.getElementById(`${id}-clear`);
    const selected = new Set();

    // If the markup isn't there (e.g. a browser still has an older cached
    // copy of filter.html), hand back a picker that does nothing rather than
    // letting one missing element break the whole page.
    if (!rootEl || !triggerEl || !valueEl || !panelEl || !listEl || !clearEl) {
      const inertEl = document.createElement("div");
      return { rootEl: inertEl, build() {}, matches: () => true, isActive: () => false };
    }

    function build() {
      const counts = new Map();
      for (const video of allVideos) {
        for (const name of video[field] || []) {
          counts.set(name, (counts.get(name) || 0) + 1);
        }
      }

      const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
      // "Other" is a catch-all, not a real game — keep it out of the way at
      // the end of the list rather than wherever it happens to sort.
      const otherIndex = names.indexOf("Other");
      if (otherIndex !== -1) {
        names.splice(otherIndex, 1);
        names.push("Other");
      }

      listEl.innerHTML = "";
      for (const name of names) {
        const label = document.createElement("label");
        label.className = "game-picker-option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = name;
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selected.add(name);
          else selected.delete(name);
          updateLabel();
          track("filter_select", {
            filter_type: field === "games" ? "game" : "series",
            filter_value: clip(name),
            selected: checkbox.checked,
          });
          updateResults();
        });

        const text = document.createElement("span");
        text.textContent = `${name} (${counts.get(name)})`;

        label.appendChild(checkbox);
        label.appendChild(text);
        listEl.appendChild(label);
      }
    }

    function updateLabel() {
      if (selected.size === 0) {
        valueEl.textContent = noneLabel;
      } else if (selected.size === 1) {
        valueEl.textContent = [...selected][0];
      } else {
        valueEl.textContent = `${selected.size} ${pluralNoun} selected`;
      }
    }

    // Ticking several names within one picker widens the net (any of them);
    // the date and the other picker then narrow it down further.
    function matches(video) {
      if (selected.size === 0) return true;
      return (video[field] || []).some((name) => selected.has(name));
    }

    triggerEl.addEventListener("click", () => {
      if (openPopover && openPopover.panelEl === panelEl) {
        closePopover();
        return;
      }
      openPopoverFor(panelEl, triggerEl);
    });

    clearEl.addEventListener("click", () => {
      selected.clear();
      for (const checkbox of listEl.querySelectorAll("input[type=checkbox]")) {
        checkbox.checked = false;
      }
      updateLabel();
      updateResults();
    });

    return { rootEl, build, matches, isActive: () => selected.size > 0 };
  }

  // ---------------------------------------------------------------------
  // Combined filtering — any mix of a search, a date, games and series (or
  // none). Everything that's set has to match.
  // ---------------------------------------------------------------------

  // Lower-cases, strips accents, drops apostrophes ("Garry's" -> "garrys")
  // and turns all other punctuation into spaces, so searches don't trip over
  // how a title happens to be punctuated.
  function normaliseForSearch(text) {
    return (text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['\u2019]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function matchesSearch(video) {
    if (searchTerms.length === 0) return true;
    const text = video.searchText || "";
    return searchTerms.every((term) => text.includes(term));
  }

  function matchesPickers(video) {
    return matchesSearch(video) && gamePicker.matches(video) && seriesPicker.matches(video);
  }

  function updateResults() {
    if (!byDay) return; // data still loading (or failed to load)
    const hasDate = selectedMonth !== null && selectedDay !== null;
    const hasPicks =
      searchTerms.length > 0 || gamePicker.isActive() || seriesPicker.isActive();

    if (!hasDate && !hasPicks) {
      showEmptyState();
      return;
    }

    let entries;
    let mode;
    if (hasDate) {
      const mm = String(selectedMonth + 1).padStart(2, "0");
      const dd = String(selectedDay).padStart(2, "0");
      entries = (byDay[`${mm}-${dd}`] || []).filter(matchesPickers);
      mode = "date";
    } else {
      entries = allVideos.filter(matchesPickers);
      mode = "all";
    }

    render(entries, mode);
  }

  function showEmptyState() {
    hideNowPlaying();
    statusEl.hidden = false;
    statusEl.textContent = "Search for a video, or pick a date, a game or a series above to see what was uploaded.";
    moreHeadingEl.hidden = true;
    shortsHeadingEl.hidden = true;
    if (toolbarEl) toolbarEl.hidden = true;
    resultsEl.innerHTML = "";
    shortsResultsEl.innerHTML = "";
    playQueue = [];
  }

  // A new set of results (the search/date/game/series changed): stop
  // whatever was playing, since it may not even be in the new results, then
  // draw them. `mode` is "date" (a specific day, maybe also filtered) or
  // "all" (every day, filtered) — it only changes the section headings.
  function render(entries, mode) {
    hideNowPlaying();
    lastEntries = entries;
    lastMode = mode;
    drawResults();
  }

  const SORTERS = {
    newest: (a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0),
    oldest: (a, b) => (a.publishedAt < b.publishedAt ? -1 : a.publishedAt > b.publishedAt ? 1 : 0),
    views: (a, b) => (b.viewCount || 0) - (a.viewCount || 0),
    // Ignores leading quotes/symbols so '"Shadow of Israphel" Part 2' files
    // under S, and "Part 2" sorts before "Part 10".
    title: (a, b) =>
      titleSortKey(a).localeCompare(titleSortKey(b), undefined, { sensitivity: "base", numeric: true }),
  };

  function titleSortKey(video) {
    return (video.title || "").replace(/^[^\p{L}\p{N}]+/u, "");
  }

  // (Re)draws the current results in the chosen sort order. Called after
  // filtering, and on its own when only the sort order changes — in which
  // case the video in the top player keeps playing.
  function drawResults() {
    const entries = [...lastEntries].sort(SORTERS[sortOrder] || SORTERS.newest);
    const mode = lastMode;

    moreHeadingEl.hidden = true;
    shortsHeadingEl.hidden = true;
    if (toolbarEl) toolbarEl.hidden = true;
    resultsEl.innerHTML = "";
    shortsResultsEl.innerHTML = "";
    statusEl.hidden = true;
    playQueue = [];

    if (entries.length === 0) {
      statusEl.hidden = false;
      statusEl.textContent =
        mode === "date"
          ? "No Yogscast main-channel videos match this date — try another day, game or series."
          : "No Yogscast main-channel videos match that combination — try loosening it.";
      return;
    }

    // Shorts don't go in the main grid — they get their own section further
    // down instead. See renderShorts().
    const regulars = entries.filter((v) => !v.isShort);
    const shorts = entries.filter((v) => v.isShort);
    playQueue = regulars;

    if (toolbarEl) {
      toolbarEl.hidden = false;
      // Autoplay needs at least two playable videos to move between.
      if (autoplayWrapEl) autoplayWrapEl.hidden = regulars.length < 2;
    }

    if (regulars.length > 0) {
      moreHeadingEl.hidden = false;
      moreHeadingEl.textContent =
        mode === "date" ? "Videos on this day" : "Matching videos";
      const grid = document.createElement("div");
      grid.className = "year-grid";
      for (const video of regulars) {
        grid.appendChild(renderCard(video, { inlinePlay: true }));
      }
      resultsEl.appendChild(grid);
    }

    renderShorts(shorts, mode);
    markPlayingCard();
  }

  // Shorts get their own section below the main grid. Each card links
  // straight out to the Short on YouTube — there's no inline player for
  // them here.
  function renderShorts(shorts, mode) {
    shortsResultsEl.innerHTML = "";

    if (shorts.length === 0) {
      shortsHeadingEl.hidden = true;
      return;
    }

    shortsHeadingEl.hidden = false;
    shortsHeadingEl.textContent =
      mode === "date" ? "Shorts on this day" : "Matching shorts";
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

  // `inlinePlay` (default true, used by the main grid) makes left-click play
  // the video right inside its own card instead of navigating away. Shorts
  // (see renderShorts) pass inlinePlay: false, so their cards just open on
  // YouTube like a normal link.
  function renderCard(video, { inlinePlay = true, href } = {}) {
    const a = document.createElement("a");
    a.className = "video-card";
    a.dataset.videoId = video.videoId;
    a.href = href || `https://www.youtube.com/watch?v=${video.videoId}`;
    a.rel = "noopener noreferrer";
    if (!inlinePlay) a.target = "_blank";

    renderCardThumb(a, video);

    if (inlinePlay) {
      // Left-click loads the video into the single player at the top of the
      // page instead of navigating away. Cmd/ctrl/shift-click (or
      // middle-click) still opens it on YouTube in a new tab, since the href
      // is left intact.
      a.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        playTopVideo(video);
      });
    }

    return a;
  }

  function renderCardThumb(a, video) {
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
  }

  // Loads a video into the single "now playing" player fixed near the top
  // of the page (where the old carousel used to live). Every card stays a
  // plain thumbnail; clicking a different card just swaps what's loaded
  // here — deliberately one player, not a carousel. A click scrolls up to
  // the player; autoplay moving on by itself leaves the scroll alone.
  function playTopVideo(video, { auto = false } = {}) {
    if (nowPlayingVideoId === video.videoId) {
      nowPlayingEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    nowPlayingVideoId = video.videoId;
    track("video_play", {
      video_id: video.videoId,
      video_title: clip(video.title),
      page_type: "filter",
      play_source: auto ? "autoplay" : "click",
    });

    // enablejsapi lets the page hear back from the player (via the YouTube
    // IFrame API) so it knows when the video ends — that drives autoplay.
    const origin = encodeURIComponent(window.location.origin);
    nowPlayingFrameEl.innerHTML = `
      <iframe
        src="https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&enablejsapi=1&origin=${origin}"
        title="${escapeHtml(video.title)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    `;
    watchForEnd(nowPlayingFrameEl.querySelector("iframe"), video.videoId);
    nowPlayingTitleEl.textContent = video.title;
    nowPlayingMetaEl.textContent = `${formatViewCount(video.viewCount)} views`;
    nowPlayingEl.hidden = false;
    markPlayingCard();
    if (!auto) nowPlayingEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Highlights whichever grid card is in the top player, so it's easy to see
  // where you are in the list (especially once autoplay has moved on).
  function markPlayingCard() {
    for (const card of resultsEl.querySelectorAll(".video-card")) {
      card.classList.toggle("is-playing", card.dataset.videoId === nowPlayingVideoId);
    }
  }

  // Stops playback and hides the player — used whenever the filtered set of
  // videos changes out from under it (a new date/game picked, etc.).
  function hideNowPlaying() {
    nowPlayingVideoId = null;
    nowPlayingEl.hidden = true;
    nowPlayingFrameEl.innerHTML = "";
    nowPlayingTitleEl.textContent = "";
    nowPlayingMetaEl.textContent = "";
    markPlayingCard();
  }

  // When the playing video ends, start the next one in the grid's current
  // order. Stops at the bottom of the list rather than wrapping round.
  function onVideoEnded(videoId) {
    if (nowPlayingVideoId !== videoId) return;
    const idx = playQueue.findIndex((v) => v.videoId === videoId);
    if (idx !== -1) {
      track("video_complete", {
        video_id: videoId,
        video_title: clip(playQueue[idx].title),
        page_type: "filter",
      });
    }
    if (!autoplayOn) return;
    if (idx === -1 || idx + 1 >= playQueue.length) return;
    playTopVideo(playQueue[idx + 1], { auto: true });
  }

  // Hooks the YouTube IFrame API onto a freshly-inserted player so we get a
  // callback when it finishes. If the API can't load (blocked, offline...),
  // playback still works — it just won't move on by itself.
  function watchForEnd(iframe, videoId) {
    loadYouTubeApi()
      .then((YT) => {
        if (!iframe.isConnected || nowPlayingVideoId !== videoId) return;
        new YT.Player(iframe, {
          events: {
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED) onVideoEnded(videoId);
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

  // Same setting as the homepage's Autoplay switch (same localStorage key).
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

  function formatViewCount(viewCount) {
    return (viewCount || 0).toLocaleString();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
