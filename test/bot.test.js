import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bot } from 'node-telegram-bot-api';
import app from '../app.js';
import { validateYouTubeUrl, getDownloaderPath, downloadAudio, cleanupAudio, checkAudioTools, describeDownloadFailure } from '../youtubeservice.js';

const url = 'https://youtu.be/EF-7XiyKKKc?si=lnFgx1OJU60N8ICw';

test('URL validation accepts the reported link and rejects unsupported input', () => {
    assert.equal(validateYouTubeUrl(url), url);
    for (const value of [undefined, '', 'Hi', '/start', 'http://youtu.be/video', 'https://youtube.com.evil.test/video', 'https://example.com', 'https://user:password@youtube.com/watch?v=x']) {
        assert.throws(() => validateYouTubeUrl(value));
    }
});

test('downloader, message routing, and cleanup regressions', async (t) => {
    const logs = [];
    t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
    t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-bot-test-'));
    const originalEnv = { ...process.env };
    t.after(async () => {
        process.env = originalEnv;
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    // An actual child process verifies argument handling and partial-file cleanup.
    const fakeTool = `#!${process.execPath}
import fs from 'node:fs/promises';
const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-version')) process.exit(0);
const output = args[args.indexOf('-o') + 1].replace('%(ext)s', 'mp3');
await fs.writeFile(output, 'fake mp3');
await fs.writeFile(output + '.part', 'partial');
if (process.env.FAKE_DOWNLOAD_FAIL) { console.error('sensitive internal error'); process.exit(1); }
`;
    await fs.writeFile(path.join(tempDir, 'package.json'), '{"type":"module"}');
    for (const name of ['yt-dlp', 'ffmpeg']) {
        await fs.writeFile(path.join(tempDir, name), fakeTool, { mode: 0o755 });
    }
    process.env.YT_DLP_PATH = path.join(tempDir, 'yt-dlp');
    process.env.PATH = `${tempDir}${path.delimiter}${process.env.PATH}`;
    await checkAudioTools();
    assert.equal(await getDownloaderPath(), process.env.YT_DLP_PATH);
    delete process.env.YT_DLP_PATH;
    const bundled = fileURLToPath(new URL('../bin/yt-dlp', import.meta.url));
    const hasBundled = await fs.access(bundled).then(() => true, () => false);
    assert.equal(await getDownloaderPath(), hasBundled ? bundled : 'yt-dlp');
    process.env.YT_DLP_PATH = path.join(tempDir, 'yt-dlp');

    const [first, second] = await Promise.all([downloadAudio(url), downloadAudio(url)]);
    assert.notEqual(first, second);
    await cleanupAudio(first);
    await cleanupAudio(second);
    await assert.rejects(fs.access(first));

    const downloads = fileURLToPath(new URL('../downloads/', import.meta.url));
    const beforeFailure = await fs.readdir(downloads);
    process.env.FAKE_DOWNLOAD_FAIL = '1';
    await assert.rejects(downloadAudio(url), /Could not download or convert/);
    assert.deepEqual(await fs.readdir(downloads), beforeFailure);
    assert.ok(logs.some((line) => line.includes('"event":"download_failed"')));
    assert.ok(!logs.some((line) => line.includes('sensitive internal error') || line.includes(url)));
    delete process.env.FAKE_DOWNLOAD_FAIL;

    let handler;
    let api;
    t.mock.method(Bot.prototype, 'on', function (kind, callback) {
        assert.equal(kind, 'message');
        handler = callback;
        api = this.api;
        return this;
    });
    t.mock.method(app, 'listen', (_port, callback) => { callback(); });
    // These are fake credentials; no Telegram API request is made.
    process.env.TELEGRAM_BOT_TOKEN = '123456:test-token';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    await import('../index.js');
    const replies = [];
    const ctx = (text) => ({ message: { text }, chat: { id: 42 }, reply: async (value) => replies.push(value) });
    await handler(ctx('/start'));
    await handler(ctx('Hi'));
    await handler(ctx(undefined));
    assert.equal(replies[0], 'Hi! Paste your YouTube link and I’ll send you the audio download.');
    assert.match(replies[1], /valid HTTPS/);
    assert.match(replies[2], /valid HTTPS/);
    assert.equal(replies.length, 3);

    let sends = 0;
    t.mock.method(api, 'sendDocument', async ({ chat_id }) => {
        assert.equal(chat_id, 42);
        sends++;
    });
    await handler(ctx(url));
    assert.equal(sends, 1);
    assert.deepEqual(await fs.readdir(downloads), beforeFailure);
    api.sendDocument = async () => {
        throw Object.assign(new Error('simulated Telegram failure'), { errorCode: 413, description: 'Request Entity Too Large' });
    };
    await handler(ctx(url));
    assert.match(replies.at(-1), /could not be delivered/);
    assert.ok(logs.some((line) => line.includes('"telegramErrorCode":413') && line.includes('telegram_file_too_large') && line.includes('uploading_to_telegram')));
    assert.ok(logs.some((line) => line.includes('telegram_upload_complete')));
    assert.deepEqual(await fs.readdir(downloads), beforeFailure);

    process.env.YT_DLP_PATH = path.join(tempDir, 'missing-tool');
    await assert.rejects(checkAudioTools(), /yt-dlp startup check failed \(executable or required interpreter not found\)/);
    await assert.rejects(downloadAudio(url), /downloader is unavailable/);
    assert.deepEqual(await fs.readdir(downloads), beforeFailure);
    process.env.YT_DLP_PATH = path.join(tempDir, 'yt-dlp');
    await fs.unlink(path.join(tempDir, 'ffmpeg'));
    process.env.PATH = tempDir;
    await assert.rejects(checkAudioTools(), /FFmpeg startup check failed \(executable or required interpreter not found\)/);
});

test('download diagnostics classify known errors without echoing raw output', () => {
    for (const [stderr, reason] of [
        ['Sign in to confirm you’re not a bot', 'youtube_bot_verification_required'],
        ['HTTP Error 429: Too Many Requests', 'youtube_rate_limited'],
        ['HTTP Error 403: Forbidden', 'media_access_forbidden'],
        ['ERROR: Postprocessing: Conversion failed!', 'audio_conversion_failed'],
        ['Requested format is not available', 'audio_format_unavailable'],
        ['No supported JavaScript runtime could be found', 'youtube_javascript_challenge_failed'],
        ['sensitive unknown failure', 'unclassified_download_error'],
    ]) assert.equal(describeDownloadFailure({ stderr }), reason);
});
