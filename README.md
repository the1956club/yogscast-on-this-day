# On This Day in Yogscast History

A fan site: land on the page and see every Yogscast main-channel video
uploaded on today's date, across every year the channel's existed.

## How it works

- `scripts/` — a small Node pipeline that talks to the YouTube Data API v3,
  pulls every public video from the Yogscast uploads playlist, and writes
  it into `docs/data/videos-by-day.json`, indexed by `MM-DD`.
- `docs/` — the actual static site (plain HTML/CSS/JS, no build step). This
  is the folder GitHub Pages serves. On load it works out today's date and
  looks up the matching entries in the JSON file.
- `.github/workflows/daily-update.yml` — runs the pipeline's incremental
  update once a day so new uploads show up automatically, and commits the
  refreshed dataset.

---

## 1. Get a YouTube Data API key

You'll need a free Google Cloud project and an API key. This has to be done
from your own Google account — here's the walkthrough:

1. Go to <https://console.cloud.google.com/> and sign in with any Google
   account (doesn't need to be special in any way).
2. Top-left, click the project dropdown → **New Project**. Give it any name,
   e.g. "yogscast-on-this-day" → **Create**. Wait for it to finish, then make
   sure it's selected in the dropdown.
3. In the search bar at the top, type **YouTube Data API v3** and open it,
   then click **Enable**.
4. In the left sidebar go to **APIs & Services → Credentials**.
5. Click **+ Create Credentials → API key**. It'll generate a key — copy it
   somewhere safe.
6. Click into the key and, under **API restrictions**, restrict it to
   "YouTube Data API v3" only (good practice, costs nothing, stops the key
   being useful for anything else if it ever leaks).
7. Optional but sensible: under **Application restrictions**, you can leave
   this as "None" since the key is only ever used from GitHub Actions and
   your own machine, never exposed in the site's front-end code.

The free quota is 10,000 units/day. A full backfill of the whole channel
costs roughly 1 unit per 50 videos fetched — even a channel with several
thousand uploads only costs a few hundred units, once. The daily incremental
update afterwards costs next to nothing (usually 1–3 units), so you'll never
come close to the limit.

**Keep this key private** — don't commit it to the repo. It goes in two
places, both explained below: your own machine's environment (for the
first backfill) and a GitHub Actions secret (for the daily refresh).

## 2. Run the first backfill locally

You'll need [Node.js](https://nodejs.org/) 18 or later installed.

```bash
cd yogscast-on-this-day
YOUTUBE_API_KEY=your_key_here npm run backfill
```

This pages through the entire channel and writes
`docs/data/videos-all.json` and `docs/data/videos-by-day.json`. It'll print
progress as it goes — for a channel this size it should take well under a
minute.

Open `docs/index.html` directly in a browser (or run any local static
server, e.g. `npx serve docs`) to check it looks right before deploying.

## 3. Push to GitHub and turn on Pages

1. Create a new repo on GitHub and push this folder to it.
2. Add your API key as a repo secret so the daily Action can use it:
   **Settings → Secrets and variables → Actions → New repository secret**,
   name it `YOUTUBE_API_KEY`, paste the key.
3. **Settings → Pages** → under "Build and deployment", set **Source** to
   "Deploy from a branch", branch `main`, folder `/docs` → **Save**.
4. GitHub will give you a `https://<username>.github.io/<repo>/` URL once
   it's built (takes a minute or two).

From here, the `daily-update.yml` workflow runs every morning, fetches any
new uploads, and commits the refreshed dataset — which GitHub Pages then
redeploys automatically. You can also trigger it manually any time from the
repo's **Actions** tab.

## 4. Point your domain at it

In the same **Settings → Pages** screen, there's a **Custom domain** field —
enter your domain there and save. GitHub will create a `CNAME` file in
`docs/` for you automatically (or you can add one yourself with just your
domain name in it, e.g. `onthisday.example.com`).

Then, at your domain registrar/DNS provider:

- For a subdomain (e.g. `onthisday.yourdomain.com`): add a **CNAME record**
  pointing to `<username>.github.io`.
- For an apex/root domain (e.g. `yourdomain.com`): add **A records**
  pointing at GitHub Pages' IPs (GitHub's docs list the current ones —
  search "GitHub Pages custom domain A records" for the up-to-date list, as
  they do occasionally change).

Tick **Enforce HTTPS** in the Pages settings once the domain's verified —
GitHub issues a free certificate for you.

## 5. Adding AdSense (once you're ready)

AdSense reviews the *live* site, so it's worth applying only once there's
real content up and the domain is connected. When you apply and get
approved:

1. Google gives you a loader `<script>` snippet and your publisher ID.
2. Paste the loader script into `docs/index.html`'s `<head>`, where the
   comment says so.
3. Replace the two empty `<div class="ad-slot">` placeholders in
   `index.html` with your actual AdSense `<ins>` ad unit tags (or add
   auto-ads, which don't need placeholder divs at all).

A couple of things worth knowing going in: AdSense generally wants a site
with a genuine privacy policy and enough original content to review (a
single-page tool with no other content sometimes gets queried) — it may be
worth adding a short "About this site" or FAQ section before applying if
it gets rejected on first pass. It's also worth double-checking your
region's rules on cookie/consent banners for ads (in the UK, that
generally means a consent banner before ad scripts load).

## Notes on the data

- "Main channel" here means `youtube.com/@yogscast`
  (`UCH-_hzb2ILSCo9ftVSnrCIQ`) specifically — not Yogscast Live or any of
  the individual creators' channels. If you'd like to fold those in later,
  the pipeline can be extended to pull from multiple channel IDs.
- Dates are the video's actual publish date/time in UTC, not upload-queue
  or playlist-add time.
- "Today" on the site is based on the visitor's own device clock/timezone,
  so someone browsing from the US will see their local "today", which
  might occasionally differ from the UK by a few hours around midnight.
