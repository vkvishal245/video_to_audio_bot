# Telegram YouTube audio bot

Express webhook bot using node-telegram-bot-api v2, yt-dlp, and FFmpeg.

## Render deployment

Use the existing Node web service with these settings:

- **Build Command:** `npm ci && bash build.sh`
- **Start Command:** `npm start` (or `node index.js`)
- **Environment:** `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`, entered securely in Render.
- **Webhook URL:** your service's HTTPS URL followed by `/telegrambot`; register it with Telegram using the same secret.

Redeploy after updating the build command. The build must print a yt-dlp version and an FFmpeg version before succeeding. Render's native runtime includes FFmpeg: https://render.com/docs/native-runtimes.

If startup fails, inspect the tool-specific startup error and the earlier build logs. A successful dependency installation alone is insufficient: look for `Installing yt-dlp...` and `Build dependencies ready!`. Check any `YT_DLP_PATH` override, or remove it to use the bundled executable. If the new deployment fails, Render can continue serving the previous version, which explains why the old `/start` errors may still appear. Check the live deployment's commit in Render's Deploys page; a restart of the old deployment does not apply the new code.

`build.sh` downloads the official yt-dlp executable into `bin/yt-dlp`. The service resolves that file relative to its source directory, so it does not depend on Render adding `bin` to `PATH`. It also enables the existing Node executable as yt-dlp's JavaScript runtime for YouTube support. Startup checks both audio tools and required credentials before accepting requests.

`spawn yt-dlp ENOENT` means the executable could not be launched; it is not a YouTube URL error. Installing npm packages alone does not install yt-dlp. `/start` now returns instructions, and ordinary text or unsupported URLs are rejected before a download begins.

## Local verification

Install yt-dlp and FFmpeg on your PATH, or run `bash build.sh` to download yt-dlp (Python 3 is required by that executable). An optional `YT_DLP_PATH` overrides the downloader executable location.

Create a local `.env` with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`. Never commit credentials.

```bash
npm install
npm test
bash build.sh
node index.js
```

In another terminal, `curl --fail http://localhost:3000/` checks the health route (use your configured PORT). For a live bot test, register the HTTPS webhook, send `/start`, send `Hi`, then send an authorized YouTube video URL. Confirm an MP3 document arrives and `downloads/` contains no request files afterward. Automated tests use fake tools and Telegram responses; they do not verify live YouTube access or Telegram delivery.

Each request has its own temporary directory. Failed downloads and completed or failed Telegram uploads remove their request files. YouTube may still reject videos because of restrictions or server IP rate limits.

## Request diagnostics

Render logs contain JSON records with a `requestId` so simultaneous requests can be followed separately. Milestones include `starting_downloader`, `downloading_audio`, `converting_to_mp3`, `mp3_ready`, `uploading_to_telegram`, and `telegram_upload_complete`. Download errors include elapsed time, exit code, and a reason classified from tool output, such as `youtube_bot_verification_required`, `media_access_forbidden`, or `audio_conversion_failed`. These classifications describe reported errors, not independently verified root causes. Telegram failures include the API error code when available. Raw process output, video URLs, credentials, and local audio paths are not logged. `unclassified_download_error` means the available diagnostics did not recognize the tool's error.

The ignore rules prevent new credentials, installed packages, executables, and audio files from being added. Files already tracked by Git remain tracked and need separate cleanup; rotate any credentials that were previously published.
