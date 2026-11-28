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

## Testing authenticated YouTube access on Render

When logs show `youtube_bot_verification_required`, YouTube rejected the server request before downloading. Cookies are an optional diagnostic and authentication method, not a guaranteed fix for restrictions on a server IP. Another cloud provider may have the same issue.

1. Export your own YouTube cookies in Netscape format following the official guide: https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies. Use only content you are authorized to download. The guide cautions that using an account with yt-dlp can result in account restrictions; prefer a separate account rather than your main account. Cookies grant access as that account, so only use this configuration for trusted bot users.
2. In Render, open the service's **Environment → Secret Files → Add file**. Name the file `youtube-cookies.txt` and paste the exported contents there. Do not put cookies in Git, Telegram messages, or chat.
3. Add the environment variable `YT_DLP_COOKIES_FILE=/etc/secrets/youtube-cookies.txt`. Render secret-file documentation: https://render.com/docs/configure-environment-variables#secret-files.
4. Deploy the updated code with the existing build/start commands. Startup validates that the configured file is readable and has a Netscape cookie header. The cookie setting is optional; omit it to continue anonymous downloads.
5. Telegram currently points to the local ngrok tunnel used for testing. Before testing Render, re-register the webhook with your Render HTTPS URL plus `/telegrambot`, using the same webhook secret. Merely deploying to Render does not change Telegram's webhook.
6. Test one authorized public video and inspect the request logs. Expired cookies need replacement. If the same verification error persists, authentication did not resolve the restriction; do not assume repeated redeploys or a paid hosting plan will fix it.

The service copies the cookie file into each request's temporary directory with private permissions. yt-dlp updates that copy; the source secret file is left untouched. Cleanup removes the temporary copy on download failure or after Telegram sending succeeds or fails. Neither cookies nor their paths are logged. Local files with `cookies` in their `.txt` filename are ignored by Git.

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
