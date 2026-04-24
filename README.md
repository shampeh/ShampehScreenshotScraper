# ◈ Shampeh Screenshot Scraper ◈

```
 ███████╗██╗  ██╗ █████╗ ███╗   ███╗██████╗ ███████╗██╗  ██╗
 ██╔════╝██║  ██║██╔══██╗████╗ ████║██╔══██╗██╔════╝██║  ██║
 ███████╗███████║███████║██╔████╔██║██████╔╝█████╗  ███████║
 ╚════██║██╔══██║██╔══██║██║╚██╔╝██║██╔═══╝ ██╔══╝  ██╔══██║
 ███████║██║  ██║██║  ██║██║ ╚═╝ ██║██║     ███████╗██║  ██║
 ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝
 ███████╗ ██████╗██████╗ ███████╗███████╗███╗   ██╗███████╗██╗  ██╗ ██████╗ ████████╗
 ██╔════╝██╔════╝██╔══██╗██╔════╝██╔════╝████╗  ██║██╔════╝██║  ██║██╔═══██╗╚══██╔══╝
 ███████╗██║     ██████╔╝█████╗  █████╗  ██╔██╗ ██║███████╗███████║██║   ██║   ██║
 ╚════██║██║     ██╔══██╗██╔══╝  ██╔══╝  ██║╚██╗██║╚════██║██╔══██║██║   ██║   ██║
 ███████║╚██████╗██║  ██║███████╗███████╗██║ ╚████║███████║██║  ██║╚██████╔╝   ██║
 ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝    ╚═╝
 ███████╗ ██████╗██████╗  █████╗ ██████╗ ███████╗██████╗
 ██╔════╝██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗
 ███████╗██║     ██████╔╝███████║██████╔╝█████╗  ██████╔╝
 ╚════██║██║     ██╔══██╗██╔══██║██╔═══╝ ██╔══╝  ██╔══██╗
 ███████║╚██████╗██║  ██║██║  ██║██║     ███████╗██║  ██║
 ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝
```

```
 ╔══════════════════════════════════════════════════════════════════════════╗
 ║                                                                          ║
 ║   ░▒▓█  SHAMPEH SCREENSHOT SCRAPER v1.0  █▓▒░                            ║
 ║                                                                          ║
 ║   ░▒▓█  RELEASE DATE :: 2026-04-18     █▓▒░                              ║
 ║   ░▒▓█  RELEASE TYPE :: tool / scraper █▓▒░                              ║
 ║   ░▒▓█  PACKER       :: node.js + express                                ║
 ║   ░▒▓█  CRACKER      :: ffmpeg mpdecimate + pHash cluster                ║
 ║   ░▒▓█  TRAINER      :: shampeh                                          ║
 ║                                                                          ║
 ╚══════════════════════════════════════════════════════════════════════════╝
```

> `scrape → select → harvest → dedupe → unique scenes`
>
> paste a TikTok channel URL, grab thumbnails, pick the ones you want, and let
> the cruncher pull every distinct visual scene out of the selected videos.
> global cluster dedupe via perceptual hashing so duplicates across videos
> get dropped — you end up with a flat folder of unique keyframes ready
> for aesthetic analysis, mood board, or training data.

---

## ░▒▓ [ RELEASE NOTES ] ▓▒░

```
 ╭─────────────────────────────────────────────────────────────────────────╮
 │                                                                         │
 │   [+]   tiktok channel scraper (yt-dlp metadata, no auth)               │
 │   [+]   thumbnail grid for selection, click to toggle                   │
 │   [+]   full-fps frame extraction w/ mpdecimate pre-filter              │
 │   [+]   global cluster-based pHash dedupe (20-tier slider)              │
 │   [+]   configurable output quality — PNG / JPEG q1 / JPEG q2           │
 │   [+]   live "unique scenes detected" preview grid during harvest       │
 │   [+]   procedural coastal-island-to-cyberpunk-metropolis progress viz  │
 │   [+]   40 themes across 6 groups, animated wallpapers, server-saved    │
 │   [+]   timestamped session folders, provenance-preserving filenames    │
 │   [+]   one-click open-folder-in-explorer on completion                 │
 │   [+]   zero-bloat local-only, no telemetry, no cloud, no login         │
 │                                                                         │
 ╰─────────────────────────────────────────────────────────────────────────╯
```

---

## ░▒▓ [ INSTALL ] ▓▒░

### Requirements

| binary | purpose | check |
|---|---|---|
| `node.js` | runs the server | `node -v` |
| `yt-dlp.exe` | scrapes TikTok metadata + downloads videos | `yt-dlp --version` |
| `ffmpeg.exe` | extracts frames + computes grayscale for pHash | `ffmpeg -version` |
| `ffprobe.exe` | ships with ffmpeg, bundled helper | — |

Drop `yt-dlp.exe`, `ffmpeg.exe`, and `ffprobe.exe` next to `server.js` — or have them on your system PATH. The server auto-detects either.

```cmd
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```

### Setup

```cmd
git clone https://github.com/shampeh/shampeh-screenshot-scraper.git
cd shampeh-screenshot-scraper
npm install
```

Or just grab the release zip and double-click `start.bat`.

---

## ░▒▓ [ RUN ] ▓▒░

```cmd
start.bat
```

Opens on `http://localhost:3847` in your default browser.

Alternatively:

```cmd
node server.js
```

---

## ░▒▓ [ USAGE ] ▓▒░

```
  1. paste a TikTok channel URL  →  https://www.tiktok.com/@shampeh.ai
  2. [ SCRAPE ]                  →  grid of video thumbnails appears
  3. click thumbs to select      →  or [SELECT ALL]
  4. pick DEDUPE level           →  20 = extreme, 1 = keep everything
  5. pick QUALITY                →  PNG / JPEG q1 / JPEG q2
  6. [ HARVEST ]                 →  city builds as job progresses
  7. [ OPEN FOLDER ]             →  jumps to your unique frames
```

### DEDUPE tiers

```
 ┌─────┬──────────────┬─────────────────────────────────────────────┐
 │  1  │ keep all     │ barely dedup, almost every frame survives   │
 │  4  │ very loose   │ drop obvious adjacent dupes only            │
 │  6  │ loose        │                                             │
 │ 10  │ medium       │ typical choice for most videos              │
 │ 12  │ tight        │ one-per-scene-ish                           │
 │ 14  │ tighter      │                                             │
 │ 16  │ very tight   │                                             │
 │ 18  │ strict       │                                             │
 │ 20  │ extreme ◆    │ only dramatically distinct scenes survive   │
 └─────┴──────────────┴─────────────────────────────────────────────┘
```

higher = fewer keepers but more visual distinction between them.
start at 20, drop lower if you're losing scenes you wanted.

### QUALITY tiers

```
 ┌──────┬────────────────────────────┬────────────────────┐
 │ PNG  │ lossless                   │ ~2 MB / frame      │
 │ q1   │ max JPEG                   │ ~500 KB / frame    │
 │ q2   │ near-lossless JPEG         │ ~200 KB / frame    │
 └──────┴────────────────────────────┴────────────────────┘
```

---

## ░▒▓ [ OUTPUT ] ▓▒░

```
 ./frames/
   └── shampeh.ai - 2026-04-18_22-47-23 - thr20 - png/
       ├── 0001_7234567891234567890.png
       ├── 0002_7234567891234567890.png
       ├── 0003_7234567891234567899.png
       ├── 0004_7234567891234567899.png
       ├── ...
       └── shampeh.ai - 2026-04-18_22-47-23 - thr20 - png.zip
```

- session folder = `[channel] - [datetime] - thr[N] - [quality]`
- filename = `[global-keep-seq]_[videoid].[ext]`
- every keeper is unique across ALL selected videos (not just within each)
- numerical prefix = order of scene-detection, sorts chronologically-ish
- session `.zip` bundles all keepers for easy share/upload (STORE mode — images are already compressed, so no CPU is wasted re-compressing them)

---

## ░▒▓ [ ARCHITECTURE ] ▓▒░

```
 ╔═════════════════════════════════════════════════════════════════╗
 ║                                                                 ║
 ║   BROWSER (single-file HTML, dark NFO palette, 40 themes)       ║
 ║     ├─ paste URL    → [SCRAPE]  → thumbnail grid                ║
 ║     ├─ click cards  → select                                    ║
 ║     └─ [HARVEST]    → SSE-driven progress overlay               ║
 ║                                                                 ║
 ║   NODE / EXPRESS  (port 3847)                                   ║
 ║     ├─ POST /scrape        list videos via yt-dlp               ║
 ║     ├─ POST /harvest       start job, returns jobId             ║
 ║     ├─ GET  /progress/:id  SSE stream of pipeline events        ║
 ║     ├─ GET  /thumb?u=…     CORS proxy for TikTok thumbs         ║
 ║     ├─ GET  /frame?s=…&f=… serves keepers from session folder   ║
 ║     ├─ POST /open-folder   spawns explorer.exe at session dir   ║
 ║     └─ GET/POST /config    persisted default theme              ║
 ║                                                                 ║
 ║   PIPELINE (per harvest)                                        ║
 ║     phase 1 :: EXTRACT                                          ║
 ║       for each selected video:                                  ║
 ║         yt-dlp download .mp4 → _tmp                             ║
 ║         ffmpeg mpdecimate full-fps extract → pool/              ║
 ║         delete source .mp4                                      ║
 ║     phase 2 :: CLUSTER DEDUPE                                   ║
 ║       pHash every pool frame (32×32 grayscale DCT)              ║
 ║       for each frame, min hamming-distance vs every kept hash   ║
 ║         if ≥ threshold → copy to session/ + emit 'kept' event   ║
 ║         else → drop                                             ║
 ║       delete pool/                                              ║
 ║     phase 3 :: ZIP                                              ║
 ║       bundle session/ keepers into session/[name].zip           ║
 ║       STORE mode (JPEG/PNG bytes stream through, no re-encode)  ║
 ║                                                                 ║
 ╚═════════════════════════════════════════════════════════════════╝
```

### Why global clustering (not pairwise)

pairwise dedupe only compares frame N to frame N-1. that's cheap but lets
the same scene survive if it shows up again 10 frames later. cluster dedupe
compares each frame to every previously-kept frame, so repeated scenes
across videos get collapsed to one canonical representative.

### Why pHash (not file hash or pixel diff)

- **file hash** catches only byte-identical files. useless — every JPEG is unique at byte level.
- **pixel diff** is slow and noisy. JPEG compression artifacts create false positives.
- **pHash** shrinks image to 8×8 DCT low-frequency coefficients, compares in 64-bit hamming space. fast, robust to re-encoding, catches "same scene different frame" cleanly.

---

## ░▒▓ [ THEMES ] ▓▒░

40 themes across 6 groups. all swap CSS vars (`--bg`, `--accent`, `--ink` etc.)
AND load a matching wallpaper (animated canvas or static pattern).

```
 ┌───────────────┬───────────────────────────────────────────────────────┐
 │  Classic  (10) │ Matrix · Warez Amber · Cyber Cyan · Blood Moon · etc │
 │  NFO       (5) │ Classic · Toxic · Razor 1911 · Fairlight · SKIDROW   │
 │  Live     (11) │ Ocean · Aurora · Lava · Galaxy · Fireflies · Plasma… │
 │  Cyberpunk (5) │ Bladerunner · Tron · Ghost · Akira · Shadowrun       │
 │  Seasonal  (4) │ Halloween · Xmas Snow · Xmas Cozy · New Year         │
 │  Chill     (6) │ Dracula · Nord · Gruvbox · Monokai · Solarized · …   │
 └───────────────┴───────────────────────────────────────────────────────┘
```

save default via server-side `config.json`. per-browser preference persists
across sessions.

---

## ░▒▓ [ KNOWN ISSUES ] ▓▒░

- **TikTok public channel cap.** yt-dlp's `--flat-playlist` typically returns 30-ish videos for a public `@user` page. not a bug in this tool — TikTok paginates. Puppeteer-with-browser-profile is the workaround if you need more.

- **Live wallpaper CPU.** ~2-5% continuous while overlay is open on modern hardware. pick a static theme (Dracula, Nord, etc.) if harvest slows down.

- **Windows Explorer exit code.** `/open-folder` spawns `explorer.exe` which returns exit 1 even on success. handled, safe to ignore.

---

## ░▒▓ [ LICENSE ] ▓▒░

MIT. do whatever, just don't blame me if TikTok rate-limits you.

---

## ░▒▓ [ GREETZ ] ▓▒░

```
 shoutout :: ffmpeg team // yt-dlp contributors // the NFO scene
             anthropic (for claude) // whoever invented perceptual hashing
```

```
 ╔══════════════════════════════════════════════════════════════════════════╗
 ║                                                                          ║
 ║                           ░▒▓█  EOF  █▓▒░                                ║
 ║                                                                          ║
 ╚══════════════════════════════════════════════════════════════════════════╝
```
