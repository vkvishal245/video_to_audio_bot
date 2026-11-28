
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
const execFileAsync = promisify(execFile);
const bundledDownloader = fileURLToPath(new URL('./bin/yt-dlp', import.meta.url));

export function validateYouTubeUrl(url) {

    // 1. Check whether URL is provided
    if (typeof url !== 'string' || !url.trim()) {
        throw new Error('YouTube URL is required');
    }

    // 2. Validate URL
    let parsedUrl;

    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error('Invalid URL');
    }

    const allowedHosts = [
        'youtube.com',
        'www.youtube.com',
        'youtu.be',
        'm.youtube.com'
    ];

    if (
        parsedUrl.protocol !== 'https:' ||
        !allowedHosts.includes(parsedUrl.hostname) ||
        parsedUrl.username || parsedUrl.password || parsedUrl.port
    ) {
        throw new Error('Please provide a valid YouTube URL');
    }
    return parsedUrl.href;
}

export async function getDownloaderPath() {
    if (process.env.YT_DLP_PATH) return process.env.YT_DLP_PATH;
    try {
        await fs.access(bundledDownloader);
        return bundledDownloader;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return 'yt-dlp';
    }
}

export async function checkAudioTools() {
    try {
        await execFileAsync(await getDownloaderPath(), ['--version']);
        await execFileAsync('ffmpeg', ['-version']);
    } catch {
        throw new Error('Audio tools unavailable. On Render, set Build Command to npm ci && bash build.sh; ensure yt-dlp and FFmpeg are installed.');
    }
}

export async function downloadAudio(url) {
    const validatedUrl = validateYouTubeUrl(url);

    // 3. Create downloads folder
    const downloadDir = fileURLToPath(new URL('./downloads/', import.meta.url));

    await fs.mkdir(downloadDir, { recursive: true });
    const requestDir = await fs.mkdtemp(path.join(downloadDir, 'audio-'));

    // 4. Generate a unique filename
    const fileName = `${randomUUID()}.mp3`;
    const filePath = path.join(requestDir, fileName);

    // 5. Download audio and convert to MP3
    try {
        await execFileAsync(await getDownloaderPath(), [
            '--ignore-config',
            '--js-runtimes', `node:${process.execPath}`,
            '-f', 'bestaudio',
            '-x',
            '--audio-format', 'mp3',
            '--no-playlist',
            '-o', path.join(requestDir, `${path.parse(fileName).name}.%(ext)s`),
            '--', validatedUrl
        ]);
        await fs.access(filePath);
    } catch (error) {
        await fs.rm(requestDir, { recursive: true, force: true });
        if (error.code === 'ENOENT' || error.code === 'EACCES') {
            throw new Error('Audio downloader is unavailable. Please ask the bot owner to check the Render build configuration.');
        }
        throw new Error('Could not download or convert this video. It may be unavailable or restricted. Please try another video.');
    }

    // 6. Return the downloaded file path
    return filePath;
}

export async function cleanupAudio(filePath) {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
}
