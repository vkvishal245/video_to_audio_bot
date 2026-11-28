import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import dotenv from 'dotenv';
import { getDownloaderPath } from './youtubeservice.js';

dotenv.config({ quiet: true });

const execFileAsync = promisify(execFile);

async function main() {
    const targetArg = process.argv[2];
    let cookieBuffer = null;
    let sourceDescription = '';

    if (targetArg) {
        try {
            cookieBuffer = await fs.readFile(targetArg);
            sourceDescription = `file: ${targetArg}`;
        } catch (err) {
            console.error(`❌ Could not read file "${targetArg}": ${err.message}`);
            process.exit(1);
        }
    } else if (process.env.YOUTUBE_COOKIES_B64?.trim()) {
        try {
            cookieBuffer = Buffer.from(process.env.YOUTUBE_COOKIES_B64.trim(), 'base64');
            sourceDescription = 'environment variable: YOUTUBE_COOKIES_B64';
        } catch (err) {
            console.error(`❌ Invalid base64 in YOUTUBE_COOKIES_B64: ${err.message}`);
            process.exit(1);
        }
    } else if (process.env.YT_DLP_COOKIES_FILE?.trim()) {
        try {
            cookieBuffer = await fs.readFile(process.env.YT_DLP_COOKIES_FILE.trim());
            sourceDescription = `file from YT_DLP_COOKIES_FILE: ${process.env.YT_DLP_COOKIES_FILE}`;
        } catch (err) {
            console.error(`❌ Could not read file from YT_DLP_COOKIES_FILE: ${err.message}`);
            process.exit(1);
        }
    } else {
        console.log(`ℹ️  Usage:
  node verify-cookies.js <path-to-youtube_cookies.txt>
  or define YOUTUBE_COOKIES_B64 in your .env file.`);
        process.exit(1);
    }

    const text = cookieBuffer.toString('utf8');

    // 1. Check Netscape format header
    if (!/^# (?:Netscape )?HTTP Cookie File/m.test(text.slice(0, 300))) {
        console.error('❌ Header check failed:');
        console.error('   The file MUST start with "# Netscape HTTP Cookie File".');
        console.error('   Make sure you did not save HTML or JSON instead of Netscape format.');
        process.exit(1);
    }
    console.log(`✅ Header format valid (${sourceDescription}).`);

    // 2. Check essential logged-in authentication cookies
    const authCookies = ['LOGIN_INFO', 'SID', 'HSID', 'SSID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID'];
    const foundAuth = authCookies.filter(name => text.includes(name));

    console.log(`🔍 Authentication cookies detected (${foundAuth.length}/${authCookies.length}):`);
    for (const name of authCookies) {
        const found = foundAuth.includes(name);
        console.log(`   ${found ? '✔' : '✖'} ${name}`);
    }

    if (!foundAuth.includes('LOGIN_INFO') && !foundAuth.includes('SID') && !foundAuth.includes('__Secure-1PSID')) {
        console.warn('\n⚠️  WARNING: Critical login cookies (LOGIN_INFO / SID) are missing!');
        console.warn('   If you used the browser console script without adding HttpOnly cookies,');
        console.warn('   the file only contains guest visitor cookies, NOT logged-in user credentials.');
    }

    // 3. Test with yt-dlp against YouTube
    console.log('\n⏳ Testing cookie authentication with yt-dlp...');
    const tempCookieFile = path.resolve('.temp-verify-cookies.txt');
    await fs.writeFile(tempCookieFile, cookieBuffer, { mode: 0o600 });

    try {
        const downloader = await getDownloaderPath();
        const testVideoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        const { stdout } = await execFileAsync(downloader, [
            '--cookies', tempCookieFile,
            '--no-progress',
            '--simulate',
            '--print', 'title',
            testVideoUrl
        ]);

        console.log('✅ YouTube test download successful!');
        console.log(`   Video title received: "${stdout.trim()}"`);

        // Generate base64 string for easy copy-paste to Render
        const b64 = cookieBuffer.toString('base64');
        console.log('\n======================================================');
        console.log('📋 Base64 string for Render (YOUTUBE_COOKIES_B64):');
        console.log('======================================================');
        console.log(b64);
        console.log('======================================================');
        console.log('👉 Copy the string above and set it in Render -> Environment -> YOUTUBE_COOKIES_B64');
    } catch (err) {
        const stderr = err.stderr || err.message;
        console.error('\n❌ YouTube rejected the request:');
        if (/sign in to confirm.*not a bot/i.test(stderr)) {
            console.error('   Reason: YouTube requires bot verification (cookies were invalid, expired, or incomplete).');
        } else {
            console.error(`   ${stderr.trim()}`);
        }
        process.exit(1);
    } finally {
        await fs.rm(tempCookieFile, { force: true });
    }
}

main();
