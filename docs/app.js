(async function () {
  const statusEl = document.getElementById("status");
  const todayLabelEl = document.getElementById("today-label");
  const resultsEl = document.getElementById("results");
  const moreHeadingEl = document.getElementById("more-heading");

  const featuredEl = document.getElementById("featured");
  const featuredPlayerEl = document.getElementById("featured-player");
  const featuredYearEl = document.getElementById("featured-year");
  const featuredTitleEl = document.getElementById("featured-title");
  const featuredDescEl = document.getElementById("featured-desc");

  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayKey = `${mm}-${dd}`;

  todayLabelEl.textContent = `On the ${ordinal(today.getDate())} of ${today.toLocaleDateString(undefined, { month: "long" })}…`;

  let allEntries = [];
  let featuredVideoId = null;

  try {
    const res = await fetch("data/videos-by-day.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load dataset (${res.status})`);
    const byDay = await res.json();

    const entries = byDay[todayKey] || [];
    render(entries);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't load the video data right now — try refreshing.";
  }

  function render(entries) {
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
    featuredVideoId = pickMostViewed(entries).videoId;
    renderCurrent();
  }

  // Re-renders the featured section + grid based on which video is
  // currently selected as featured (featuredVideoId), without re-fetching
  // anything. Called on first load and whenever a grid card is clicked.
  function renderCurrent() {
    const featured =
      allEntries.find((v) => v.videoId === featuredVideoId) || pickMostViewed(allEntries);
    featuredVideoId = featured.videoId;

    renderFeatured(featured);

    const rest = allEntries.filter((v) => v.videoId !== featured.videoId);
    resultsEl.innerHTML = "";
    if (rest.length > 0) {
      moreHeadingEl.hidden = false;
      const grid = document.createElement("div");
      grid.className = "year-grid";
      for (const video of rest) {
        grid.appendChild(renderCard(video));
      }
      resultsEl.appendChild(grid);
    } else {
      moreHeadingEl.hidden = true;
    }
  }

  // Picks the most-viewed video (ties broken by most recent year). Falls
  // back to the newest video if view counts aren't in the dataset yet.
  function pickMostViewed(entries) {
    return [...entries].sort((a, b) => {
      const byViews = (b.viewCount || 0) - (a.viewCount || 0);
      return byViews !== 0 ? byViews : b.year - a.year;
    })[0];
  }

  function renderFeatured(video) {
    featuredEl.hidden = false;

    featuredPlayerEl.innerHTML = `
      <iframe
        src="https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1"
        title="${escapeHtml(video.title)}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    `;

    featuredYearEl.textContent = video.year;
    featuredTitleEl.textContent = video.title;
    featuredDescEl.textContent = firstLine(video.description);
  }

  function renderCard(video) {
    const a = document.createElement("a");
    a.className = "video-card";
    a.href = `https://www.youtube.com/watch?v=${video.videoId}`;
    a.rel = "noopener noreferrer";

    // Left-click plays the video right here on the page instead of
    // navigating away. Cmd/ctrl/shift-click (or middle-click) still opens
    // it on YouTube in a new tab, since the href is left intact.
    a.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      featuredVideoId = video.videoId;
      renderCurrent();
      featuredEl.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
