// Small helper around the parts of the YouTube Data API v3 we need.
// Uses the global fetch() built into Node 18+.

const API_BASE = "https://www.googleapis.com/youtube/v3";

async function apiGet(path, params, apiKey) {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API error ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

// Turn a channel ID into its "uploads" playlist ID (contains every public
// upload from that channel, in reverse-chronological order).
async function getUploadsPlaylistId(channelId, apiKey) {
  const data = await apiGet(
    "channels",
    { part: "contentDetails", id: channelId },
    apiKey
  );
  const item = data.items && data.items[0];
  if (!item) throw new Error(`No channel found for ID ${channelId}`);
  return item.contentDetails.relatedPlaylists.uploads;
}

// Fetches one page of playlistItems. Returns { videos, nextPageToken }.
// `videos` only includes items that are still public (private/deleted
// uploads have no videoPublishedAt and get skipped).
async function getPlaylistPage(playlistId, pageToken, apiKey) {
  const data = await apiGet(
    "playlistItems",
    {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: 50,
      pageToken,
    },
    apiKey
  );

  const videos = (data.items || [])
    .filter((item) => item.contentDetails && item.contentDetails.videoPublishedAt)
    .map((item) => ({
      videoId: item.contentDetails.videoId,
      title: item.snippet.title,
      publishedAt: item.contentDetails.videoPublishedAt, // ISO 8601, real publish date
    }));

  return { videos, nextPageToken: data.nextPageToken };
}

module.exports = { getUploadsPlaylistId, getPlaylistPage };
