const fs = require("fs");
const path = require("path");

// Both files live inside docs/data so the "docs" folder is fully
// self-contained and can be served directly by GitHub Pages
// (Settings > Pages > Source: Deploy from a branch > /docs).
const ALL_VIDEOS_PATH = path.join(__dirname, "..", "..", "docs", "data", "videos-all.json");
const BY_DAY_PATH = path.join(__dirname, "..", "..", "docs", "data", "videos-by-day.json");

function loadAllVideos() {
  if (!fs.existsSync(ALL_VIDEOS_PATH)) return [];
  return JSON.parse(fs.readFileSync(ALL_VIDEOS_PATH, "utf8"));
}

// Rebuilds data/videos-by-day.json from the flat video list.
// Keyed by "MM-DD" (UTC), each entry sorted newest year first.
function buildByDayIndex(allVideos) {
  const byDay = {};

for (const v of allVideos) {
  const d = new Date(v.publishedAt);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const key = `${mm}-${dd}`;

  if (!byDay[key]) byDay[key] = [];
  byDay[key].push({
    videoId: v.videoId,
    title: v.title,
    description: v.description || "",
    viewCount: v.viewCount || 0,
    year: d.getUTCFullYear(),
    publishedAt: v.publishedAt,
  });
}

for (const key of Object.keys(byDay)) {
  byDay[key].sort((a, b) => b.year - a.year);
}

return byDay;
}

function saveAll(allVideos) {
  // De-dupe by videoId and sort newest-first, just to keep the file tidy
// and deterministic between runs.
const seen = new Map();
  for (const v of allVideos) seen.set(v.videoId, v);
  const deduped = [...seen.values()].sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
    );

fs.mkdirSync(path.dirname(ALL_VIDEOS_PATH), { recursive: true });
  fs.writeFileSync(ALL_VIDEOS_PATH, JSON.stringify(deduped, null, 2));

const byDay = buildByDayIndex(deduped);
  fs.writeFileSync(BY_DAY_PATH, JSON.stringify(byDay));

return { total: deduped.length, days: Object.keys(byDay).length };
}

module.exports = { loadAllVideos, saveAll, ALL_VIDEOS_PATH, BY_DAY_PATH };
