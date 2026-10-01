// Cheap daily refresh: only pages through the uploads playlist until it
// reaches a video already in the dataset, then stops. This relies on the
// uploads playlist being returned newest-first, which is how YouTube
// serves it.
//
// Usage:
//   YOUTUBE_API_KEY=xxxx node scripts/update.js
//
// This is what the GitHub Action runs every day. If the dataset doesn't
// exist yet, it just does a full backfill instead.

const fs = require("fs");
const { getUploadsPlaylistId, getPlaylistPage, getViewCounts } = require("./lib/youtube");
const { loadAllVideos, saveAll, ALL_VIDEOS_PATH } = require("./lib/dataset");

const CHANNEL_ID = "UCH-_hzb2ILSCo9ftVSnrCIQ"; // The Yogscast (main channel)

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("Set YOUTUBE_API_KEY in your environment first.");
    process.exit(1);
  }

if (!fs.existsSync(ALL_VIDEOS_PATH)) {
  console.log("No existing dataset found, running a full backfill instead.");
  require("./backfill");
  return;
}

const existing = loadAllVideos();
  const knownIds = new Set(existing.map((v) => v.videoId));

console.log("Looking up uploads playlist...");
  const playlistId = await getUploadsPlaylistId(CHANNEL_ID, apiKey);

const newVideos = [];
  let pageToken = undefined;
  let page = 0;
  let hitKnownVideo = false;

do {
  page += 1;
  const { videos, nextPageToken } = await getPlaylistPage(playlistId, pageToken, apiKey);

  for (const v of videos) {
    if (knownIds.has(v.videoId)) {
      hitKnownVideo = true;
      break;
    }
    newVideos.push(v);
  }

  pageToken = hitKnownVideo ? undefined : nextPageToken;
  console.log(`Page ${page}: +${newVideos.length} new videos so far`);
} while (pageToken);

if (newVideos.length === 0) {
  console.log("No new videos since the last run.");
  return;
}

console.log(`Fetching view counts for ${newVideos.length} new video(s)...`);
  const viewCounts = await getViewCounts(newVideos.map((v) => v.videoId), apiKey);
  for (const v of newVideos) {
    v.viewCount = viewCounts.get(v.videoId) || 0;
  }

const { total, days } = saveAll([...existing, ...newVideos]);
  console.log(`\nAdded ${newVideos.length} new video(s). Dataset now has ${total} videos across ${days} days.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
