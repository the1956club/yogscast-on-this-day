(async function () {
  const resultsEl = document.getElementById("results");
  const statusEl = document.getElementById("status");
  const todayLabelEl = document.getElementById("today-label");

  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayKey = `${mm}-${dd}`;

  todayLabelEl.textContent = formatMonthDay(today);

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
    if (entries.length === 0) {
      resultsEl.innerHTML = `
        <p class="empty-state">
          No Yogscast main-channel videos were uploaded on this date &mdash;
          at least not yet. Check back tomorrow!
        </p>`;
      return;
    }

    const grid = document.createElement("div");
    grid.className = "year-grid";

    for (const video of entries) {
      grid.appendChild(renderCard(video));
    }

    resultsEl.innerHTML = "";
    resultsEl.appendChild(grid);
  }

  function renderCard(video) {
    const a = document.createElement("a");
    a.className = "video-card";
    a.href = `https://www.youtube.com/watch?v=${video.videoId}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

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

  function formatMonthDay(date) {
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
