
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
    let downloader;
    try {
        downloader = await getDownloaderPath();
        await execFileAsync(downloader, ['--version']);
    } catch (error) {
        const reason = toolFailureReason(error);
        throw new Error(`yt-dlp startup check failed (${reason}). On Render, set Build Command to npm ci && bash build.sh and redeploy. If YT_DLP_PATH is set, check it points to an executable on the server.`);
    }
    try {
        await execFileAsync('ffmpeg', ['-version']);
    } catch (error) {
        throw new Error(`FFmpeg startup check failed (${toolFailureReason(error)}). Ensure the ffmpeg executable is available on the server PATH.`);
    }
    await readConfiguredCookies();
}

async function readConfiguredCookies() {
    const source = process.env.YT_DLP_COOKIES_FILE?.trim();
    if (!source) return null;
    try {
        const contents = await fs.readFile(source);
        if (!/^# (?:Netscape )?HTTP Cookie File\r?\n/.test(contents.toString('utf8', 0, 100))) {
            throw new Error();
        }
        return contents;
    } catch {
        throw Object.assign(new Error('YT_DLP_COOKIES_FILE must point to a readable Netscape-format cookies file. Cookie contents were not logged.'), { code: 'COOKIE_FILE_INVALID' });
    }
}

function toolFailureReason(error) {
    // Report only known codes; process stderr and command arguments may contain secrets.
    if (error.code === 'ENOENT') return 'executable or required interpreter not found';
    if (error.code === 'EACCES') return 'executable permission denied';
    if (error.code === 'ENOEXEC') return 'incompatible executable format';
    return 'executable returned an error';
}

export function describeDownloadFailure(error) {
    const stderr = String(error.stderr || '');
    if (error.code === 'ENOENT' || error.code === 'EACCES') return 'downloader_missing_or_not_executable';
    if (/sign in to confirm.*not a bot|confirm you.re not a bot/i.test(stderr)) return 'youtube_bot_verification_required';
    if (/HTTP Error 429|too many requests/i.test(stderr)) return 'youtube_rate_limited';
    if (/HTTP Error 403|forbidden/i.test(stderr)) return 'media_access_forbidden';
    if (/ffmpeg.*not found|ffprobe.*not found/i.test(stderr)) return 'ffmpeg_or_ffprobe_missing';
    if (/postprocessing|conversion failed/i.test(stderr)) return 'audio_conversion_failed';
    if (/requested format.*not available/i.test(stderr)) return 'audio_format_unavailable';
    if (/javascript runtime|challenge solving|n challenge|signature extraction/i.test(stderr)) return 'youtube_javascript_challenge_failed';
    if (/private video|video unavailable|not available|age.restricted|sign in to confirm your age/i.test(stderr)) return 'video_unavailable_or_restricted';
    if (/timed out|name resolution|unable to download webpage|network is unreachable/i.test(stderr)) return 'network_request_failed';
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'downloader_output_limit_exceeded';
    return 'unclassified_download_error';
}

export async function downloadAudio(url, { requestId = randomUUID() } = {}) {
    const validatedUrl = validateYouTubeUrl(url);
    const startedAt = Date.now();
    const logStage = (stage, extra = {}) => console.log(JSON.stringify({ requestId, stage, elapsedMs: Date.now() - startedAt, ...extra }));

    // 3. Create downloads folder
    const downloadDir = fileURLToPath(new URL('./downloads/', import.meta.url));

    await fs.mkdir(downloadDir, { recursive: true });
    const requestDir = await fs.mkdtemp(path.join(downloadDir, 'audio-'));

    // 4. Generate a unique filename
    const fileName = `${randomUUID()}.mp3`;
    const filePath = path.join(requestDir, fileName);

    // 5. Download audio and convert to MP3
    let stage = 'starting_downloader';
    logStage(stage);
    try {
        const cookieArgs = [];
        const cookies = await readConfiguredCookies();
        if (cookies) {
            // yt-dlp writes its cookie jar; keep the secret source read-only and
            // isolate each request so concurrent downloads cannot overwrite it.
            const cookiePath = path.join(requestDir, 'cookies.txt');
            await fs.writeFile(cookiePath, cookies, { mode: 0o600 });
            cookieArgs.push('--cookies', cookiePath);
        }
        const download = execFileAsync(await getDownloaderPath(), [
            ...cookieArgs,
            '--no-progress',
            '-f', 'bestaudio',
            '-x',
            '--audio-format', 'mp3',
            '--no-playlist',
            '-o', path.join(requestDir, `${path.parse(fileName).name}.%(ext)s`),
            '--', validatedUrl
        ]);
        // Only log recognized milestones, never raw tool output or URLs.
        let pendingOutput = '';
        download.child.stdout.on('data', (chunk) => {
            pendingOutput += chunk.toString();
            const lines = pendingOutput.split('\n');
            pendingOutput = lines.pop().slice(-4096);
            for (const line of lines) {
                const nextStage = line.includes('[ExtractAudio]') ? 'converting_to_mp3'
                    : line.includes('[download]') ? 'downloading_audio' : null;
                if (nextStage && nextStage !== stage) {
                    stage = nextStage;
                    logStage(stage);
                }
            }
        });
        await download;
        await fs.access(filePath);
        logStage('mp3_ready');
    } catch (error) {
        const reason = describeDownloadFailure(error);
        console.error(JSON.stringify({ requestId, stage, event: 'download_failed',
            reason: error.code === 'COOKIE_FILE_INVALID' ? 'cookie_configuration_invalid' : reason,
            exitCode: Number.isInteger(error.code) ? error.code : null,
            elapsedMs: Date.now() - startedAt }));
        await fs.rm(requestDir, { recursive: true, force: true });
        if (error.code === 'COOKIE_FILE_INVALID') throw error;
        if (reason === 'youtube_bot_verification_required') {
            throw Object.assign(new Error('YouTube requires verification for this server.'), { code: 'YOUTUBE_BOT_VERIFICATION_REQUIRED' });
        }
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
