// One-off (or occasional) full backfill: pages through the ENTIRE Yogscast
// uploads playlist and writes data/videos-all.json + data/videos-by-day.json.
//
// Usage:
//   YOUTUBE_API_KEY=xxxx node scripts/backfill.js
//
// Safe to re-run any time — it always fetches the whole channel and
// overwrites the dataset, deduping by video ID.

const { getUploadsPlaylistId, getPlaylistPage } = require("./lib/youtube");
const { saveAll } = require("./lib/dataset");

const CHANNEL_ID = "UCH-_hzb2ILSCo9ftVSnrCIQ"; // The Yogscast (main channel)

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("Set YOUTUBE_API_KEY in your environment first.");
    process.exit(1);
  }

  console.log("Looking up uploads playlist...");
  const playlistId = await getUploadsPlaylistId(CHANNEL_ID, apiKey);
  console.log(`Uploads playlist: ${playlistId}`);

  const allVideos = [];
  let pageToken = undefined;
  let page = 0;

  do {
    page += 1;
    const { videos, nextPageToken } = await getPlaylistPage(playlistId, pageToken, apiKey);
    allVideos.push(...videos);
    pageToken = nextPageToken;
    console.log(`Page ${page}: +${videos.length} videos (running total ${allVideos.length})`);
  } while (pageToken);

  const { total, days } = saveAll(allVideos);
  console.log(`\nDone. ${total} videos saved across ${days} distinct calendar days.`);
  console.log("Wrote data/videos-all.json and data/videos-by-day.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
