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

  if (searchInputEl) {
    searchInputEl.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const query = normaliseForSearch(searchInputEl.value);
        searchTerms = query.length >= 2 ? query.split(" ") : [];
        updateResults();
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
    const res = await fetch("data/videos-by-day.json", { cache: "no-store" });
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
    resultsEl.innerHTML = "";
    shortsResultsEl.innerHTML = "";
  }

  // Clears whatever was on screen for the previous selection, then builds
  // the grid(s) for the new one. Safe to call repeatedly as the pickers
  // change. `mode` is "date" (a specific day, maybe also game/series-
  // filtered) or "all" (every day, filtered to the chosen games/series) — it
  // only changes the section headings.
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
          ? "No Yogscast main-channel videos match this date — try another day, game or series."
          : "No Yogscast main-channel videos match that combination — try loosening it.";
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
