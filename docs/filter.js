(async function () {
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");
  const moreHeadingEl = document.getElementById("more-heading");
  const shortsHeadingEl = document.getElementById("shorts-heading");
  const shortsResultsEl = document.getElementById("shorts-results");

  const pickerEl = document.getElementById("date-picker");
  const triggerEl = document.getElementById("date-picker-trigger");
  const triggerValueEl = document.getElementById("date-picker-value");
  const panelEl = document.getElementById("date-picker-panel");
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
  // The card currently showing an inline player instead of its thumbnail,
  // and the video it's playing — so a second click elsewhere can swap it
  // back to a thumbnail before playing the new one.
  let playing = null;

  // The month currently shown in the open calendar panel, vs. the month/day
  // the visitor has actually picked (null until they click a day).
  let viewMonth = new Date().getMonth();
  let selectedMonth = null;
  let selectedDay = null;

  // No default date and nothing fetched-and-rendered up front — a first-time
  // visitor sees an empty page (just the picker) until they choose a date.
  try {
    const res = await fetch("data/videos-by-day.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load dataset (${res.status})`);
    byDay = await res.json();
    statusEl.textContent = "Pick a date above to see what was uploaded that day.";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't load the video data right now — try refreshing.";
  }

  triggerEl.addEventListener("click", () => {
    if (panelEl.hidden) {
      viewMonth = selectedMonth !== null ? selectedMonth : new Date().getMonth();
      renderCalendar();
      openPanel();
    } else {
      closePanel();
    }
  });

  prevMonthEl.addEventListener("click", () => {
    viewMonth = (viewMonth + 11) % 12;
    renderCalendar();
  });

  nextMonthEl.addEventListener("click", () => {
    viewMonth = (viewMonth + 1) % 12;
    renderCalendar();
  });

  function openPanel() {
    panelEl.hidden = false;
    triggerEl.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onDocumentKeydown);
  }

  function closePanel() {
    panelEl.hidden = true;
    triggerEl.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onDocumentKeydown);
  }

  function onDocumentClick(event) {
    if (!pickerEl.contains(event.target)) closePanel();
  }

  function onDocumentKeydown(event) {
    if (event.key === "Escape") {
      closePanel();
      triggerEl.focus();
    }
  }

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
    triggerValueEl.textContent = `${day} ${MONTH_NAMES[month]}`;
    closePanel();
    loadForMonthDay(month, day);
  }

  function loadForMonthDay(month, day) {
    if (!byDay) return;
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const entries = byDay[`${mm}-${dd}`] || [];
    render(entries);
  }

  // Clears whatever was on screen for the previous date, then builds the
  // grid(s) for the new one. Safe to call repeatedly as the picker changes.
  function render(entries) {
    playing = null;

    moreHeadingEl.hidden = true;
    shortsHeadingEl.hidden = true;
    resultsEl.innerHTML = "";
    shortsResultsEl.innerHTML = "";
    statusEl.hidden = true;

    if (entries.length === 0) {
      statusEl.hidden = false;
      statusEl.textContent =
        "No Yogscast main-channel videos were uploaded on this date — try another day.";
      return;
    }

    // Shorts don't go in the main grid — they get their own section further
    // down instead. See renderShorts().
    const regulars = entries.filter((v) => !v.isShort);
    const shorts = entries.filter((v) => v.isShort);

    if (regulars.length > 0) {
      moreHeadingEl.hidden = false;
      const grid = document.createElement("div");
      grid.className = "year-grid";
      for (const video of regulars) {
        grid.appendChild(renderCard(video, { inlinePlay: true }));
      }
      resultsEl.appendChild(grid);
    }

    renderShorts(shorts);
  }

  // Shorts get their own section below the main grid. Each card links
  // straight out to the Short on YouTube — there's no inline player for
  // them here.
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
      // Left-click plays the video right here in the card instead of
      // navigating away. Cmd/ctrl/shift-click (or middle-click) still opens
      // it on YouTube in a new tab, since the href is left intact.
      a.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        playCard(a, video);
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

  function renderCardPlayer(a, video) {
    a.innerHTML = `
      <div class="thumb-wrap">
        <iframe
          src="https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1"
          title="${escapeHtml(video.title)}"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(video.title)}</p>
        <p class="card-date">${formatViewCount(video.viewCount)} views</p>
      </div>
    `;
  }

  // Swaps the clicked card over to an inline player, putting back whichever
  // card was previously playing (if any) first.
  function playCard(a, video) {
    if (playing && playing.video.videoId === video.videoId) return;
    if (playing) renderCardThumb(playing.el, playing.video);
    renderCardPlayer(a, video);
    playing = { el: a, video };
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
