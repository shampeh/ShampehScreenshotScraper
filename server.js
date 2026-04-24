// ╔══════════════════════════════════════════════════════════════╗
// ║  SHAMPEH SCREENSHOT SCRAPER :: server.js                      ║
// ║  scrape → harvest → dedupe                                    ║
// ╚══════════════════════════════════════════════════════════════╝
//
//  endpoints:
//    POST /scrape          { url }                 -> list up to 40 videos
//    POST /harvest         { channel, videos[] }   -> start job, returns jobId
//    GET  /progress/:jobId                         -> SSE stream of updates
//    GET  /thumb?u=<url>                           -> CORS proxy for TT thumbs
//    GET  /                                        -> serves index.html
//
//  requires on PATH or in cwd:
//    yt-dlp.exe
//    ffmpeg.exe

const express = require('express');
const { spawn } = require('child_process');
const fs       = require('fs');
const fsp      = require('fs/promises');
const path     = require('path');
const https    = require('https');
const { randomUUID } = require('crypto');

const PORT       = 3847;
const OUTPUT_ROOT = path.join(__dirname, 'frames');
const TMP_ROOT    = path.join(__dirname, '_tmp');

// resolve binaries: prefer co-located .exe, fall back to PATH
function resolveBin(name) {
    const local = path.join(__dirname, name);
    try { fs.accessSync(local); return local; } catch {}
    return name;  // rely on PATH
}
const YTDLP  = resolveBin('yt-dlp.exe');
const FFMPEG = resolveBin('ffmpeg.exe');

// dedupe: hamming distance threshold between consecutive kept frames
// 0  = identical, 64 = max. ~8-12 works well for "meaningfully different"
const DEDUPE_THRESHOLD = 10;

// frames whose mean grayscale brightness is below this are treated as
// blank/near-black and dropped. 0 = pure black, 255 = pure white.
// fade-to-black transitions usually hit < 12.
const BLANK_BRIGHTNESS_THRESHOLD = 12;

console.log(`  yt-dlp :: ${YTDLP}`);
console.log(`  ffmpeg :: ${FFMPEG}`);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// ── in-memory job registry ─────────────────────────────────────
// jobId -> { status, log[], done, total, clients:Set<res> }
const jobs = new Map();

function newJob() {
    const id = randomUUID();
    jobs.set(id, {
        status: 'pending',
        log: [],
        done: 0,
        total: 0,
        clients: new Set(),
        startedAt: Date.now(),
    });
    return id;
}

function emit(jobId, event) {
    const job = jobs.get(jobId);
    if (!job) return;
    const line = { t: Date.now(), ...event };
    job.log.push(line);
    for (const res of job.clients) {
        try { res.write(`data: ${JSON.stringify(line)}\n\n`); } catch (_) {}
    }
}

// ── helpers ────────────────────────────────────────────────────
function sanitize(s) {
    return String(s || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80);
}

function extractChannel(url) {
    const m = String(url).match(/@([A-Za-z0-9_.]+)/);
    return m ? m[1] : null;
}

function runCapture(cmd, args, { onLine } = {}) {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { windowsHide: true });
        let stdout = '', stderr = '';
        p.stdout.on('data', d => {
            stdout += d.toString();
            if (onLine) d.toString().split(/\r?\n/).forEach(l => l && onLine('out', l));
        });
        p.stderr.on('data', d => {
            stderr += d.toString();
            if (onLine) d.toString().split(/\r?\n/).forEach(l => l && onLine('err', l));
        });
        p.on('error', reject);
        p.on('close', code => resolve({ code, stdout, stderr }));
    });
}

// ── zip builder (zero-dep, STORE mode) ─────────────────────────
//
// Screenshots are already entropy-dense (JPEG/PNG), so DEFLATE would
// burn CPU for ~0% gain. STORE (no compression) is the right call —
// the zip exists to bundle files for sharing, not to shrink them.
//
// Writes directly to disk in a single pass (no in-memory buffering of
// all file bytes), so it scales to thousands of frames without RAM spikes.

// precompute CRC-32 table
const CRC32_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c >>> 0;
    }
    return t;
})();

function crc32Update(crc, buf) {
    let c = crc ^ 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        c = CRC32_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// stream the CRC-32 of a file without loading it fully into memory
function crc32File(filePath) {
    return new Promise((resolve, reject) => {
        let crc = 0;
        const s = fs.createReadStream(filePath);
        s.on('data', chunk => { crc = crc32Update(crc, chunk); });
        s.on('error', reject);
        s.on('end', () => resolve(crc));
    });
}

// dos time/date for zip headers (ZIP epoch = 1980)
function dosTimeDate(d = new Date()) {
    const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
    const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);
    return { time, date };
}

// Build a STORE-mode zip at zipPath containing files from srcDir.
// files = array of filenames (relative to srcDir). onProgress(done, total, bytes) optional.
async function buildZipStore(srcDir, files, zipPath, onProgress) {
    const out = fs.createWriteStream(zipPath);
    const writeBuf = (b) => new Promise((res, rej) => { out.write(b, err => err ? rej(err) : res()); });
    const pipeFile = (p) => new Promise((res, rej) => {
        const rs = fs.createReadStream(p);
        rs.on('error', rej);
        rs.on('end', res);
        rs.pipe(out, { end: false });
    });

    const entries = [];          // metadata for central directory
    let offset = 0;              // running byte offset into zip
    const { time, date } = dosTimeDate();

    for (let i = 0; i < files.length; i++) {
        const name = files[i];
        const filePath = path.join(srcDir, name);
        const stat = await fsp.stat(filePath);
        const size = stat.size;
        const nameBuf = Buffer.from(name, 'utf8');
        const crc = await crc32File(filePath);

        // local file header (30 bytes + name)
        const lfh = Buffer.alloc(30);
        lfh.writeUInt32LE(0x04034b50, 0);       // signature
        lfh.writeUInt16LE(20, 4);                // version needed
        lfh.writeUInt16LE(0x0800, 6);            // flags: bit 11 = UTF-8 name
        lfh.writeUInt16LE(0, 8);                 // method 0 = STORE
        lfh.writeUInt16LE(time, 10);
        lfh.writeUInt16LE(date, 12);
        lfh.writeUInt32LE(crc, 14);
        lfh.writeUInt32LE(size, 18);             // compressed size == size (STORE)
        lfh.writeUInt32LE(size, 22);
        lfh.writeUInt16LE(nameBuf.length, 26);
        lfh.writeUInt16LE(0, 28);                // extra field length

        await writeBuf(lfh);
        await writeBuf(nameBuf);
        const localHeaderOffset = offset;
        offset += lfh.length + nameBuf.length;

        await pipeFile(filePath);
        offset += size;

        entries.push({ name: nameBuf, size, crc, time, date, localHeaderOffset });
        if (onProgress) onProgress(i + 1, files.length, offset);
    }

    // central directory
    const cdStart = offset;
    for (const e of entries) {
        const cdh = Buffer.alloc(46);
        cdh.writeUInt32LE(0x02014b50, 0);        // signature
        cdh.writeUInt16LE(20, 4);                 // version made by
        cdh.writeUInt16LE(20, 6);                 // version needed
        cdh.writeUInt16LE(0x0800, 8);             // flags
        cdh.writeUInt16LE(0, 10);                 // method
        cdh.writeUInt16LE(e.time, 12);
        cdh.writeUInt16LE(e.date, 14);
        cdh.writeUInt32LE(e.crc, 16);
        cdh.writeUInt32LE(e.size, 20);
        cdh.writeUInt32LE(e.size, 24);
        cdh.writeUInt16LE(e.name.length, 28);
        cdh.writeUInt16LE(0, 30);                 // extra field
        cdh.writeUInt16LE(0, 32);                 // comment
        cdh.writeUInt16LE(0, 34);                 // disk #
        cdh.writeUInt16LE(0, 36);                 // internal attrs
        cdh.writeUInt32LE(0, 38);                 // external attrs
        cdh.writeUInt32LE(e.localHeaderOffset, 42);

        await writeBuf(cdh);
        await writeBuf(e.name);
        offset += cdh.length + e.name.length;
    }
    const cdSize = offset - cdStart;

    // end of central directory
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);                     // disk #
    eocd.writeUInt16LE(0, 6);                     // disk with CD start
    eocd.writeUInt16LE(entries.length, 8);        // entries on this disk
    eocd.writeUInt16LE(entries.length, 10);       // total entries
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);                    // comment length
    await writeBuf(eocd);

    await new Promise((res, rej) => out.end(err => err ? rej(err) : res()));
    const finalStat = await fsp.stat(zipPath);
    return { bytes: finalStat.size, entries: entries.length };
}

// ── pHash + dedupe helpers ─────────────────────────────────────
//
// Strategy:
//   ffmpeg re-reads each JPEG, downscales to 32x32 grayscale, pipes
//   raw 8-bit bytes to stdout. We compute a 64-bit pHash via DCT on
//   the 32x32 matrix (standard pHash algorithm).
//
// This avoids pulling in sharp/jimp/native deps. ffmpeg is already
// in our toolchain.

async function grayscale32(jpegPath) {
    return new Promise((resolve, reject) => {
        const p = spawn(FFMPEG, [
            '-i', jpegPath,
            '-vf', 'scale=32:32,format=gray',
            '-f', 'rawvideo',
            '-hide_banner',
            '-loglevel', 'error',
            'pipe:1',
        ], { windowsHide: true });
        const chunks = [];
        let err = '';
        p.stdout.on('data', c => chunks.push(c));
        p.stderr.on('data', c => err += c.toString());
        p.on('error', reject);
        p.on('close', code => {
            if (code !== 0) return reject(new Error(`ffmpeg gray fail: ${err.slice(-200)}`));
            resolve(Buffer.concat(chunks));  // 1024 bytes, 32x32 grayscale
        });
    });
}

// 1D DCT-II, used separably for 2D
function dct1d(vec) {
    const N = vec.length;
    const out = new Float64Array(N);
    for (let k = 0; k < N; k++) {
        let sum = 0;
        for (let n = 0; n < N; n++) {
            sum += vec[n] * Math.cos(Math.PI * (2 * n + 1) * k / (2 * N));
        }
        out[k] = sum;
    }
    return out;
}

function pHash(gray1024) {
    // reshape 1024 bytes -> 32x32 matrix
    const N = 32;
    const mat = [];
    for (let y = 0; y < N; y++) {
        const row = new Float64Array(N);
        for (let x = 0; x < N; x++) row[x] = gray1024[y * N + x];
        mat.push(row);
    }
    // DCT rows
    const rowsDct = mat.map(dct1d);
    // DCT cols on the row-DCT result
    const full = [];
    for (let y = 0; y < N; y++) full.push(new Float64Array(N));
    for (let x = 0; x < N; x++) {
        const col = new Float64Array(N);
        for (let y = 0; y < N; y++) col[y] = rowsDct[y][x];
        const colDct = dct1d(col);
        for (let y = 0; y < N; y++) full[y][x] = colDct[y];
    }
    // take top-left 8x8, skip DC (0,0), compute median of remaining 63
    const lowFreq = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) lowFreq.push(full[y][x]);
    const withoutDC = lowFreq.slice(1).sort((a, b) => a - b);
    const median = withoutDC[Math.floor(withoutDC.length / 2)];
    // build 64-bit hash as BigInt
    let hash = 0n;
    for (let i = 0; i < 64; i++) {
        if (lowFreq[i] > median) hash |= (1n << BigInt(i));
    }
    return hash;
}

function hamming(a, b) {
    let x = a ^ b;
    let count = 0;
    while (x) { count += Number(x & 1n); x >>= 1n; }
    return count;
}

async function dedupeToSession_DEPRECATED() {
    // old per-video pairwise dedupe, replaced by global clustering in processJob
    throw new Error('deprecated');
}

// ── POST /scrape ───────────────────────────────────────────────
app.post('/scrape', async (req, res) => {
    const { url } = req.body || {};
    console.log(`\n[scrape] ${new Date().toISOString()} :: ${url}`);

    if (!url || !/tiktok\.com/.test(url)) {
        console.log('[scrape] rejected: bad URL');
        return res.status(400).json({ error: 'Provide a tiktok.com URL' });
    }
    const channel = extractChannel(url);
    if (!channel) {
        console.log('[scrape] rejected: no @channel in URL');
        return res.status(400).json({ error: 'Could not parse @channel from URL' });
    }
    console.log(`[scrape] channel = @${channel}`);
    console.log(`[scrape] running: ${YTDLP} --flat-playlist --dump-json ${url}`);

    try {
        const t0 = Date.now();
        const { code, stdout, stderr } = await runCapture(YTDLP, [
            '--flat-playlist',
            '--dump-json',
            '--no-warnings',
            url,
        ]);
        const ms = Date.now() - t0;
        console.log(`[scrape] yt-dlp exit=${code} in ${ms}ms (stdout=${stdout.length}b stderr=${stderr.length}b)`);

        if (code !== 0 && !stdout.trim()) {
            console.log(`[scrape] STDERR:\n${stderr}`);
            return res.status(500).json({
                error: `yt-dlp exited ${code}`,
                detail: stderr.slice(-1500) || '(empty stderr)',
            });
        }

        const videos = stdout
            .split(/\r?\n/)
            .filter(Boolean)
            .map(line => { try { return JSON.parse(line); } catch { return null; } })
            .filter(Boolean)
            .map(v => {
                const thumbList = [];
                if (Array.isArray(v.thumbnails)) {
                    // yt-dlp orders lowest-quality first; reverse to try highest first
                    for (const th of v.thumbnails.slice().reverse()) {
                        if (th && th.url) thumbList.push(th.url);
                    }
                }
                if (v.thumbnail && !thumbList.includes(v.thumbnail)) {
                    thumbList.unshift(v.thumbnail);
                }
                return {
                    id: v.id,
                    url: v.url || v.webpage_url || `https://www.tiktok.com/@${channel}/video/${v.id}`,
                    title: v.title || v.description || v.id,
                    duration: v.duration,
                    thumbnail: thumbList[0] || null,
                    thumbnails: thumbList,
                    uploader: v.uploader || channel,
                };
            });

        console.log(`[scrape] parsed ${videos.length} videos`);
        res.json({ channel, count: videos.length, videos });
    } catch (err) {
        console.log(`[scrape] EXCEPTION: ${err.message}`);
        console.log(err.stack);
        const friendly = err.code === 'ENOENT'
            ? `Cannot find executable: ${YTDLP}. Put yt-dlp.exe next to server.js or on PATH.`
            : err.message;
        res.status(500).json({ error: friendly });
    }
});

// ── GET /thumb?u=<url> (CORS proxy) ────────────────────────────
// follow redirects up to N hops
function fetchImage(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        const go = (u, remaining) => {
            https.get(u, {
                headers: {
                    'Referer': 'https://www.tiktok.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            }, (resp) => {
                // follow redirects
                if ([301, 302, 303, 307, 308].includes(resp.statusCode) && resp.headers.location && remaining > 0) {
                    resp.resume();  // drain
                    const next = new URL(resp.headers.location, u).href;
                    return go(next, remaining - 1);
                }
                if (resp.statusCode !== 200) {
                    resp.resume();
                    return reject(new Error(`upstream ${resp.statusCode}`));
                }
                resolve(resp);
            }).on('error', reject);
        };
        go(url, maxRedirects);
    });
}

app.get('/thumb', async (req, res) => {
    const u = req.query.u;
    if (!u || !/^https?:\/\//.test(u)) return res.status(400).end();
    try {
        const upstream = await fetchImage(u);
        res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        upstream.pipe(res);
    } catch (_) {
        res.status(502).end();
    }
});

// ── config persistence (theme default etc) ─────────────────────
const CONFIG_FILE = path.join(__dirname, 'config.json');

function readConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
    catch { return { theme: 'matrix' }; }
}
function writeConfig(c) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));
}

app.get('/config', (req, res) => res.json(readConfig()));
app.post('/config', (req, res) => {
    const cur = readConfig();
    const next = { ...cur, ...(req.body || {}) };
    writeConfig(next);
    res.json(next);
});

// ── serve a kept frame from a session folder ──
// GET /frame?s=<sessionName>&f=<filename>
app.get('/frame', (req, res) => {
    const s = String(req.query.s || '');
    const f = String(req.query.f || '');
    // strict: session must exist under OUTPUT_ROOT, no path traversal
    if (!s || !f || s.includes('..') || f.includes('..') || f.includes('/') || f.includes('\\')) {
        return res.status(400).end();
    }
    const full = path.join(OUTPUT_ROOT, s, f);
    if (!full.startsWith(OUTPUT_ROOT)) return res.status(400).end();
    fs.stat(full, (err) => {
        if (err) return res.status(404).end();
        res.sendFile(full);
    });
});

// ── open a session folder in Windows Explorer ──
app.post('/open-folder', (req, res) => {
    const s = String((req.body && req.body.session) || '');
    if (!s || s.includes('..')) return res.status(400).json({ error: 'bad session' });
    const full = path.join(OUTPUT_ROOT, s);
    if (!full.startsWith(OUTPUT_ROOT)) return res.status(400).json({ error: 'bad path' });
    try {
        // explorer.exe returns exit code 1 even on success — ignore it
        spawn('explorer.exe', [full], { detached: true, stdio: 'ignore' }).unref();
        res.json({ ok: true, path: full });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /harvest ──────────────────────────────────────────────
app.post('/harvest', async (req, res) => {
    const { channel, videos, threshold, quality } = req.body || {};
    if (!channel || !Array.isArray(videos) || !videos.length) {
        return res.status(400).json({ error: 'channel + videos[] required' });
    }

    // threshold: user-tunable. default to DEDUPE_THRESHOLD if not provided.
    const thr = Number.isFinite(threshold) ? threshold : DEDUPE_THRESHOLD;
    // quality: 'q2' (default, near-lossless JPEG), 'q1' (max JPEG), 'png' (lossless)
    const q = ['q1', 'q2', 'png'].includes(quality) ? quality : 'q2';

    const jobId = newJob();
    const job = jobs.get(jobId);
    job.total = videos.length;

    // build a timestamped session folder: "channel - 2026-04-18_22-47-23 - thr12 - q2"
    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const sessionName = `${sanitize(channel)} - ${stamp} - thr${thr} - ${q}`;
    const sessionDir = path.join(OUTPUT_ROOT, sessionName);

    // fire-and-forget; client will connect to SSE for progress
    processJob(jobId, sessionName, sessionDir, videos, thr, q).catch(err => {
        emit(jobId, { type: 'err', msg: `fatal: ${err.message}` });
        job.status = 'failed';
    });

    res.json({ jobId, sessionDir });
});

// ── SSE /progress/:jobId ───────────────────────────────────────
app.get('/progress/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // replay backlog
    for (const line of job.log) res.write(`data: ${JSON.stringify(line)}\n\n`);
    job.clients.add(res);

    req.on('close', () => job.clients.delete(res));
});

// ── the actual pipeline ────────────────────────────────────────
async function processJob(jobId, sessionName, sessionDir, videos, threshold, quality) {
    const job = jobs.get(jobId);
    job.status = 'running';
    emit(jobId, { type: 'info', msg: `job start :: ${videos.length} videos :: threshold=${threshold} :: quality=${quality} :: ${sessionName}` });
    emit(jobId, { type: 'info', msg: `output :: ${sessionDir}` });

    // quality → ffmpeg output args + extension
    // q1 = max JPEG (qscale 1), q2 = near-lossless JPEG (qscale 2), png = lossless
    const ext = quality === 'png' ? 'png' : 'jpg';
    const qArgs = quality === 'png' ? ['-compression_level', '2']
                : quality === 'q1'  ? ['-q:v', '1']
                : ['-q:v', '2'];

    await fsp.mkdir(TMP_ROOT, { recursive: true });
    await fsp.mkdir(sessionDir, { recursive: true });

    // pool all raw frames from all videos here, tagged with videoId prefix
    const poolDir = path.join(TMP_ROOT, `pool_${Date.now()}`);
    await fsp.mkdir(poolDir, { recursive: true });

    // ── PHASE 1 :: extract all frames from all videos ──
    emit(jobId, { type: 'phase', phase: 'extract', msg: 'phase 1: extracting frames from all videos' });

    for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const vid = sanitize(v.id);
        const tmpFile = path.join(TMP_ROOT, `${vid}.mp4`);

        emit(jobId, { type: 'info', msg: `[${i + 1}/${videos.length}] ${vid} :: extract`, videoId: vid, idx: i });

        try {
            // download
            emit(jobId, { type: 'step', msg: `download`, videoId: vid, phase: 'download' });
            const dl = await runCapture(YTDLP, [
                '-f', 'mp4/best',
                '-o', tmpFile,
                '--no-warnings',
                v.url,
            ], {
                onLine: (kind, line) => {
                    const m = line.match(/\[download\]\s+([\d.]+)%/);
                    if (m) emit(jobId, { type: 'progress', videoId: vid, phase: 'download', pct: parseFloat(m[1]) });
                },
            });
            if (dl.code !== 0) throw new Error(`yt-dlp exit ${dl.code}: ${dl.stderr.slice(-400)}`);

            // extract into pool with videoId prefix: {vid}__f_NNNNN.{ext}
            emit(jobId, { type: 'step', msg: `ffmpeg mpdecimate extract (${quality})`, videoId: vid, phase: 'frames' });
            const ff = await runCapture(FFMPEG, [
                '-i', tmpFile,
                '-vf', 'mpdecimate=hi=768:lo=320:frac=0.33,setpts=N/FRAME_RATE/TB',
                '-vsync', 'vfr',
                ...qArgs,
                path.join(poolDir, `${vid}__f_%05d.${ext}`),
                '-y',
                '-hide_banner',
                '-loglevel', 'error',
            ]);
            if (ff.code !== 0) throw new Error(`ffmpeg exit ${ff.code}: ${ff.stderr.slice(-400)}`);

            await fsp.unlink(tmpFile).catch(() => {});

            const extracted = (await fsp.readdir(poolDir))
                .filter(f => f.startsWith(`${vid}__`)).length;

            emit(jobId, {
                type: 'video_extracted',
                videoId: vid,
                idx: i,
                extracted,
                msg: `[${i + 1}/${videos.length}] ${vid} :: ${extracted} raw frames extracted`,
            });
            job.done++;
        } catch (err) {
            emit(jobId, { type: 'err', videoId: vid, msg: `[${i + 1}/${videos.length}] ${vid} EXTRACT FAILED :: ${err.message}` });
            await fsp.unlink(tmpFile).catch(() => {});
        }
    }

    // ── PHASE 2 :: global cluster dedupe ──
    const extRe = new RegExp(`__f_\\d+\\.${ext}$`, 'i');
    const allFrames = (await fsp.readdir(poolDir))
        .filter(f => extRe.test(f))
        .sort();  // sort so videos process in selection order, frames in temporal order

    emit(jobId, { type: 'phase', phase: 'dedupe', msg: `phase 2: global cluster dedupe :: ${allFrames.length} frames :: threshold=${threshold}` });

    if (allFrames.length === 0) {
        await fsp.rm(poolDir, { recursive: true, force: true }).catch(() => {});
        job.status = 'complete';
        emit(jobId, { type: 'complete', msg: `job done :: 0 frames extracted`, sessionDir, session: sessionName });
        setTimeout(() => {
            for (const res of job.clients) { try { res.end(); } catch (_) {} }
            job.clients.clear();
        }, 1000);
        return;
    }

    // compute hashes AND mean brightness for all frames (fast pass)
    emit(jobId, { type: 'step', msg: `hashing ${allFrames.length} frames`, phase: 'hash' });
    const hashes = [];
    const isBlank = [];  // parallel array: true = skip this frame as near-black
    for (let i = 0; i < allFrames.length; i++) {
        try {
            const gray = await grayscale32(path.join(poolDir, allFrames[i]));
            // mean brightness check
            let sum = 0;
            for (let b = 0; b < gray.length; b++) sum += gray[b];
            const mean = sum / gray.length;
            isBlank.push(mean < BLANK_BRIGHTNESS_THRESHOLD);
            hashes.push(pHash(gray));
        } catch {
            hashes.push(null);  // null means "always keep"
            isBlank.push(false);
        }
        if (i % 25 === 0 || i === allFrames.length - 1) {
            emit(jobId, { type: 'progress', phase: 'hash', pct: ((i + 1) / allFrames.length) * 100 });
        }
    }

    // cluster dedupe: keep a frame only if it's >= threshold hamming away from EVERY previously kept frame
    emit(jobId, { type: 'step', msg: `clustering (min-distance = ${threshold})`, phase: 'cluster' });
    const keptHashes = [];
    const keptFiles = [];
    let keepSeq = 0;

    for (let i = 0; i < allFrames.length; i++) {
        // skip near-black frames silently
        if (isBlank[i]) {
            if (i % 25 === 0 || i === allFrames.length - 1) {
                emit(jobId, {
                    type: 'progress', phase: 'cluster',
                    pct: ((i + 1) / allFrames.length) * 100,
                    kept: keptFiles.length, scanned: i + 1, total: allFrames.length,
                });
            }
            continue;
        }
        const h = hashes[i];
        let minDist = Infinity;
        if (h === null) {
            minDist = Infinity;  // failed hash → keep
        } else {
            for (const kh of keptHashes) {
                const d = hamming(kh, h);
                if (d < minDist) minDist = d;
                if (minDist < threshold) break;  // early exit
            }
        }

        if (minDist >= threshold) {
            keepSeq++;
            // keep the videoId prefix, add keep sequence
            const orig = allFrames[i];
            const vidPart = orig.split('__')[0];
            const outName = `${String(keepSeq).padStart(4, '0')}_${vidPart}.${ext}`;
            await fsp.copyFile(path.join(poolDir, orig), path.join(sessionDir, outName));
            if (h !== null) keptHashes.push(h);
            keptFiles.push(outName);
            // notify UI so it can load the preview
            emit(jobId, {
                type: 'kept',
                session: sessionName,
                filename: outName,
                seq: keepSeq,
                videoId: vidPart,
            });
        }

        if (i % 25 === 0 || i === allFrames.length - 1) {
            emit(jobId, {
                type: 'progress',
                phase: 'cluster',
                pct: ((i + 1) / allFrames.length) * 100,
                kept: keptFiles.length,
                scanned: i + 1,
                total: allFrames.length,
            });
        }
    }

    // cleanup pool
    await fsp.rm(poolDir, { recursive: true, force: true }).catch(() => {});

    // ── PHASE 3 :: zip the keepers ──
    let zipInfo = null;
    if (keptFiles.length > 0) {
        try {
            emit(jobId, { type: 'phase', phase: 'zip', msg: `phase 3: zipping ${keptFiles.length} frames` });
            const zipName = `${sessionName}.zip`;
            const zipPath = path.join(sessionDir, zipName);
            // emit progress no more often than every ~4%
            let lastPct = -5;
            const result = await buildZipStore(sessionDir, keptFiles, zipPath, (done, total, bytes) => {
                const pct = (done / total) * 100;
                if (pct - lastPct >= 4 || done === total) {
                    lastPct = pct;
                    emit(jobId, {
                        type: 'progress', phase: 'zip',
                        pct, done, total, bytes,
                    });
                }
            });
            zipInfo = { zipName, zipPath, bytes: result.bytes, entries: result.entries };
            emit(jobId, {
                type: 'step', phase: 'zip',
                msg: `zip written :: ${zipName} :: ${result.entries} files :: ${(result.bytes / 1048576).toFixed(1)} MB`,
            });
        } catch (err) {
            // zip failure shouldn't fail the whole job — frames are already on disk
            emit(jobId, { type: 'err', phase: 'zip', msg: `zip failed (frames are still in folder): ${err.message}` });
        }
    }

    job.status = 'complete';
    emit(jobId, {
        type: 'complete',
        msg: `job done :: ${allFrames.length} raw → ${keptFiles.length} unique scenes → ${sessionDir}`,
        sessionDir,
        session: sessionName,
        totalRaw: allFrames.length,
        totalKept: keptFiles.length,
        zipName: zipInfo ? zipInfo.zipName : null,
        zipBytes: zipInfo ? zipInfo.bytes : null,
    });

    setTimeout(() => {
        for (const res of job.clients) { try { res.end(); } catch (_) {} }
        job.clients.clear();
    }, 1000);
}

// ── boot ───────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`╔════════════════════════════════════════════════════╗`);
    console.log(`║  SHAMPEH SCREENSHOT SCRAPER listening :: :${PORT}      ║`);
    console.log(`╚════════════════════════════════════════════════════╝`);
    console.log(`  output :: ${OUTPUT_ROOT}`);
    console.log(`  tmp    :: ${TMP_ROOT}`);
});
