# AGENTS.md --- Telegram YouTube Audio Bot

## Project purpose

This project is a Node.js Telegram bot. A user sends a YouTube video URL
to the bot, the application downloads the audio, converts it to MP3 with
`yt-dlp` and FFmpeg, and sends the MP3 back to the same Telegram chat as
a downloadable document.

The application uses: - Node.js with ES modules (`"type": "module"`). -
Express for the HTTP server. - `node-telegram-bot-api` v2 API. -
Telegram webhooks (not long polling). - `yt-dlp` for downloading
audio. - FFmpeg for audio extraction/conversion.

## Important development rules

1.  Preserve the existing Express webhook architecture. Do not replace
    it with polling or a `bot.launch()` / `bot.run()` approach.
2.  Use the installed `node-telegram-bot-api` v2 API. Do not introduce
    v1-style examples such as `new TelegramBot(...)`,
    `bot.processUpdate(...)`, or `bot.sendMessage(...)`.
3.  Keep the project in ES module syntax (`import` / `export`).
4.  Keep download and conversion logic in the YouTube service module.
    Keep Telegram message handling in the bot entry point.
5.  Use `await` for asynchronous operations and handle failures with
    `try/catch`.
6.  Use `execFile` or another argument-array process API to invoke
    `yt-dlp`; do not build shell command strings from user-provided
    URLs.
7.  Validate incoming URLs before passing them to `yt-dlp`. Accept only
    HTTPS YouTube URLs from an explicit hostname allowlist.
8.  Create the downloads directory when needed. Use unique output
    filenames to avoid collisions.
9.  Delete temporary audio files after Telegram has finished sending
    them, including when sending fails (`finally` cleanup).
10. Do not log bot tokens, webhook secrets, or other credentials.
11. Do not commit `.env`, `node_modules/`, or generated audio files.
12. Do not add Docker or change hosting architecture unless the project
    owner explicitly asks.

## Expected project structure

Keep the current repository structure if it differs. A typical layout
is:

``` text
TBOT/
├── index.js
├── app.js
├── package.json
├── package-lock.json
├── .env                 # local only; never commit
├── .gitignore
├── services/
│   └── youtube.service.js
└── downloads/            # generated temporary files; never commit
```

## Environment variables

The application expects these variables:

``` env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
PORT=3000
```

-   Load environment variables with `dotenv`.
-   Validate that the required token and webhook secret exist at
    startup; fail with a clear error if either is missing.
-   Never print their values.
-   The webhook secret configured in Express must match the secret
    configured with Telegram's `setWebhook` API.
-   Keep `.env` out of version control.

## Local setup on another computer

### 1. Install prerequisites

Install a supported Node.js LTS release.

Install `yt-dlp` and FFmpeg and ensure both executables are available on
the system `PATH`.

Examples:

macOS with Homebrew:

``` bash
brew install yt-dlp ffmpeg
```

Ubuntu/Debian:

``` bash
sudo apt update
sudo apt install ffmpeg
```

Install `yt-dlp` using its current official installation instructions
for the operating system, then verify both commands:

``` bash
yt-dlp --version
ffmpeg -version
```

Windows: install FFmpeg and yt-dlp using their official installation
instructions and ensure their executable locations are on `PATH`.
Restart the terminal after changing `PATH`.

### 2. Get the project and install packages

``` bash
git clone YOUR_REPOSITORY_URL
cd YOUR_PROJECT_DIRECTORY
npm install
```

If the repository uses a different package manager and has a
corresponding lockfile, use that package manager consistently.

### 3. Create `.env`

Create `.env` in the project root using the environment-variable names
above. Obtain credentials securely from the project owner; never put
credentials in source code or chat logs.

### 4. Start the application

``` bash
node index.js
```

Confirm that the Express server starts on the configured port.

### 5. Expose the local server for Telegram webhooks

For local development, run a tunnel such as ngrok in a second terminal:

``` bash
ngrok http 3000
```

Use the HTTPS forwarding URL and append the configured webhook path:

``` text
https://YOUR-NGROK-HOST/telegrambot
```

Register that URL with Telegram using the bot's `setWebhook` API and the
same webhook secret used by the application. Do not commit or publish
the token or secret. If the tunnel URL changes, register the new webhook
URL.

Both the Node.js process and the tunnel must remain running for the bot
to receive updates.

## Telegram API implementation notes

The project uses the v2 package API. The established integration pattern
is:

``` js
import { Bot, registerExpressWebhook } from 'node-telegram-bot-api';
import { fromPath } from 'node-telegram-bot-api/node';

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

registerExpressWebhook(bot, app, {
  path: '/telegrambot',
  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET
});
```

For a local file upload, use the package's file helper and API object:

``` js
const document = await fromPath(filePath);

await bot.api.sendDocument({
  chat_id: chatId,
  document,
  caption: 'Your audio is ready!'
});
```

Follow the installed package version's documentation if its API changes.
Do not silently mix v1 and v2 API styles.

## Download service requirements

The download service should:

-   Accept a URL string and return the completed MP3 file path.
-   Reject missing, malformed, non-HTTPS, or non-YouTube URLs.
-   Use an explicit allowlist such as `youtube.com`, `www.youtube.com`,
    `m.youtube.com`, and `youtu.be`.
-   Create the downloads directory with recursive directory creation.
-   Generate a unique filename for each request.
-   Invoke `yt-dlp` with argument arrays, including audio extraction and
    MP3 conversion options.
-   Surface useful, sanitized errors to the caller.
-   Avoid returning a direct media stream URL when the bot's required
    behavior is to send an MP3 file.

## Operational and safety considerations

-   Telegram has file-size and API limits. Check current Telegram Bot
    API limits before changing upload behavior.
-   YouTube downloads may fail because of unavailable videos, age
    restrictions, regional restrictions, rate limits, or changes to
    YouTube. Report failures clearly; do not claim every URL is
    downloadable.
-   Respect copyright, platform terms, and applicable laws. Only
    download content the user is authorized to download.
-   Avoid concurrent-download resource exhaustion. If adding concurrency
    controls, keep them simple and document their behavior.
-   Do not expose the Express webhook endpoint without the configured
    Telegram secret-token validation.
-   Do not add public debug endpoints that reveal environment variables,
    filesystem paths, or internal errors.

## Testing checklist

Before considering a change complete:

-   [ ] `npm install` completes successfully.
-   [ ] `yt-dlp --version` works.
-   [ ] `ffmpeg -version` works.
-   [ ] The application starts with `node index.js`.
-   [ ] The Express health route responds, if one is configured.
-   [ ] Telegram webhook points to the current HTTPS tunnel URL plus
    `/telegrambot`.
-   [ ] `/start` receives the expected response.
-   [ ] A valid YouTube URL downloads and is sent as a Telegram
    document.
-   [ ] An invalid or non-YouTube URL is rejected cleanly.
-   [ ] Temporary MP3 files are removed after sending or failure.
-   [ ] No credentials or downloaded files are committed.

## How an AI coding agent should work

-   First inspect the existing files and `package.json`; do not assume
    the repository exactly matches the example structure.
-   Explain the proposed change briefly before making broad
    architectural changes.
-   Make the smallest change that solves the reported issue.
-   Do not replace working code or change package major versions without
    explaining the reason.
-   Do not invent environment-variable values, webhook URLs,
    credentials, or test results.
-   If a command requires a secret, show a placeholder and instruct the
    owner to enter it locally.
-   After changes, list the files changed and the exact local commands
    the owner should run to verify them.
-   If a prerequisite or operating system is unknown, ask one focused
    question rather than guessing.
