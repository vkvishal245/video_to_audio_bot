# Telegram YouTube audio bot

Express webhook bot using node-telegram-bot-api v2, yt-dlp, and FFmpeg.

## Render deployment

Use the existing Node web service with these settings:

- **Build Command:** `npm ci && bash build.sh`
- **Start Command:** `npm start` (or `node index.js`)
- **Environment:** `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`, entered securely in Render.
- **Webhook URL:** your service's HTTPS URL followed by `/telegrambot`; register it with Telegram using the same secret.

Redeploy after updating the build command. The build must print a yt-dlp version and an FFmpeg version before succeeding. Render's native runtime includes FFmpeg: https://render.com/docs/native-runtimes.

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

The ignore rules prevent new credentials, installed packages, executables, and audio files from being added. Files already tracked by Git remain tracked and need separate cleanup; rotate any credentials that were previously published.
