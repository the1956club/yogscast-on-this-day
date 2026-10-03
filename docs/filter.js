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

  // --- Date picker elements ---
  const datePickerEl = document.getElementById("date-picker");
  const dateTriggerEl = document.getElementById("date-picker-trigger");
  const dateTriggerValueEl = document.getElementById("date-picker-value");
  const datePanelEl = document.getElementById("date-picker-panel");
  const monthLabelEl = document.getElementById("date-picker-month");
  const daysGridEl = document.getElementById("date-picker-days");
  const prevMonthEl = document.getElementById("date-picker-prev");
  const nextMonthEl = document.getElementById("date-picker-next");

  // --- Game picker elements ---
  const gamePickerEl = document.getElementById("game-picker");
  const gameTriggerEl = document.getElementById("game-picker-trigger");
  const gameTriggerValueEl = document.getElementById("game-picker-value");
  const gamePanelEl = document.getElementById("game-picker-panel");
  const gameListEl = document.getElementById("game-picker-list");
  const gameClearEl = document.getElementById("game-picker-clear");

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
  // Every video across every day, flattened once up front so the "by game"
  // filter can browse across all dates, not just one day at a time.
  let allVideos = [];
  // The video currently loaded in the single top player, if any (not a
  // per-card thing — every card stays a thumbnail; clicking any of them
  // just changes what's loaded here).
  let nowPlayingVideoId = null;

  // The month currently shown in the open calendar panel, vs. the month/day
  // the visitor has actually picked (null until they click a day).
  let viewMonth = new Date().getMonth();
  let selectedMonth = null;
  let selectedDay = null;

  // Games the visitor has ticked in the game picker. Empty = no game filter.
  const selectedGames = new Set();

  // Only one popover (date or game) open at a time.
  let openPopover = null; // { panelEl, triggerEl }

  // No default date/game and nothing fetched-and-rendered up front — a
  // first-time visitor sees an empty page (just the pickers) until they
  // choose something.
  try {
    const res = await fetch("data/videos-by-day.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load dataset (${res.status})`);
    byDay = await res.json();
    for (const entries of Object.values(byDay)) {
      for (const video of entries) allVideos.push(video);
    }
    // Newest first, so browsing a game with no date picked reads like a feed.
    allVideos.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

    buildGameList();
    showEmptyState();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't load the video data right now — try refreshing.";
  }

  // ---------------------------------------------------------------------
  // Popover plumbing shared by the date picker and the game picker — only
  // one of the two panels is ever open at once.
  // ---------------------------------------------------------------------

  function openPopoverFor(panelEl, triggerEl) {
    if (openPopover && openPopover.panelEl !== panelEl) closePopover();
    panelEl.hidden = false;
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
    if (
      !datePickerEl.contains(event.target) &&
      !gamePickerEl.contains(event.target)
    ) {
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
    updateResults();
  }

  // ---------------------------------------------------------------------
  // Game picker
  // ---------------------------------------------------------------------

  function buildGameList() {
    const counts = new Map();
    for (const video of allVideos) {
      for (const game of video.games || []) {
        counts.set(game, (counts.get(game) || 0) + 1);
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

    gameListEl.innerHTML = "";
    for (const name of names) {
      const label = document.createElement("label");
      label.className = "game-picker-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = name;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedGames.add(name);
        else selectedGames.delete(name);
        updateGameTriggerLabel();
        updateResults();
      });

      const text = document.createElement("span");
      text.textContent = `${name} (${counts.get(name)})`;

      label.appendChild(checkbox);
      label.appendChild(text);
      gameListEl.appendChild(label);
    }
  }

  gameTriggerEl.addEventListener("click", () => {
    if (openPopover && openPopover.panelEl === gamePanelEl) {
      closePopover();
      return;
    }
    openPopoverFor(gamePanelEl, gameTriggerEl);
  });

  gameClearEl.addEventListener("click", () => {
    selectedGames.clear();
    for (const checkbox of gameListEl.querySelectorAll("input[type=checkbox]")) {
      checkbox.checked = false;
    }
    updateGameTriggerLabel();
    updateResults();
  });

  function updateGameTriggerLabel() {
    if (selectedGames.size === 0) {
      gameTriggerValueEl.textContent = "All games";
    } else if (selectedGames.size === 1) {
      gameTriggerValueEl.textContent = [...selectedGames][0];
    } else {
      gameTriggerValueEl.textContent = `${selectedGames.size} games selected`;
    }
  }

  // ---------------------------------------------------------------------
  // Combined filtering — a date, a set of games, both, or neither.
  // ---------------------------------------------------------------------

  function matchesSelectedGames(video) {
    if (selectedGames.size === 0) return true;
    return (video.games || []).some((g) => selectedGames.has(g));
  }

  function updateResults() {
    const hasDate = selectedMonth !== null && selectedDay !== null;
    const hasGames = selectedGames.size > 0;

    if (!hasDate && !hasGames) {
      showEmptyState();
      return;
    }

    let entries;
    let mode;
    if (hasDate) {
      const mm = String(selectedMonth + 1).padStart(2, "0");
      const dd = String(selectedDay).padStart(2, "0");
      entries = (byDay[`${mm}-${dd}`] || []).filter(matchesSelectedGames);
      mode = "date";
    } else {
      entries = allVideos.filter(matchesSelectedGames);
      mode = "game";
    }

    render(entries, mode);
  }

  function showEmptyState() {
    hideNowPlaying();
    statusEl.hidden = false;
    statusEl.textContent = "Pick a date or a game above to see what was uploaded.";
    moreHeadingEl.hidden = true;
    shortsHeadingEl.hidden = true;
    resultsEl.innerHTML = "";
    shortsResultsEl.innerHTML = "";
  }

  // Clears whatever was on screen for the previous selection, then builds
  // the grid(s) for the new one. Safe to call repeatedly as the pickers
  // change. `mode` is "date" (a specific day, maybe also game-filtered) or
  // "game" (every day, filtered to the chosen game(s)) — it only changes
  // the section headings.
  function render(entries, mode) {
    hideNowPlaying();

    moreHeadingEl.hidden = true;
    shortsHeadingEl.hidden = true;
    resultsEl.innerHTML = "";
    shortsResultsEl.innerHTML = "";
    statusEl.hidden = true;

    if (entries.length === 0) {
      statusEl.hidden = false;
      statusEl.textContent =
        mode === "date"
          ? "No Yogscast main-channel videos match this date — try another day or game."
          : "No Yogscast main-channel videos match this game — try another one.";
      return;
    }

    // Shorts don't go in the main grid — they get their own section further
    // down instead. See renderShorts().
    const regulars = entries.filter((v) => !v.isShort);
    const shorts = entries.filter((v) => v.isShort);

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
  // of the page (where the old carousel used to live) and scrolls it into
  // view. Every card stays a plain thumbnail — nothing in the grid itself
  // ever changes. Clicking a different card just swaps what's loaded here;
  // this is deliberately one player, not a carousel.
  function playTopVideo(video) {
    if (nowPlayingVideoId === video.videoId) {
      nowPlayingEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    nowPlayingVideoId = video.videoId;

    nowPlayingFrameEl.innerHTML = `
      <iframe
        src="https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1"
        title="${escapeHtml(video.title)}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    `;
    nowPlayingTitleEl.textContent = video.title;
    nowPlayingMetaEl.textContent = `${formatViewCount(video.viewCount)} views`;
    nowPlayingEl.hidden = false;
    nowPlayingEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Stops playback and hides the player — used whenever the filtered set of
  // videos changes out from under it (a new date/game picked, etc.).
  function hideNowPlaying() {
    nowPlayingVideoId = null;
    nowPlayingEl.hidden = true;
    nowPlayingFrameEl.innerHTML = "";
    nowPlayingTitleEl.textContent = "";
    nowPlayingMetaEl.textContent = "";
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
