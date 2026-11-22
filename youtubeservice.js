
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { URL } from 'node:url';
const execFileAsync = promisify(execFile);

export async function downloadAudio(url) {

    // 1. Check whether URL is provided
    if (!url) {
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
        !allowedHosts.includes(parsedUrl.hostname)
    ) {
        throw new Error('Please provide a valid YouTube URL');
    }

    // 3. Create downloads folder
    const downloadDir = path.resolve('downloads');

    await fs.mkdir(downloadDir, { recursive: true });

    // 4. Generate a unique filename
    const fileName = `${randomUUID()}.mp3`;
    const filePath = path.join(downloadDir, fileName);

    // 5. Download audio and convert to MP3
    await execFileAsync('yt-dlp', [
        '-f', 'bestaudio',
        '-x',
        '--audio-format', 'mp3',
        '--no-playlist',
        '-o', filePath,
        url
    ]);

    // 6. Return the downloaded file path
    return filePath;
}
