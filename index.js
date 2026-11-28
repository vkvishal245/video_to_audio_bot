
import app from './app.js';
import dotenv from 'dotenv';
import { downloadAudio, validateYouTubeUrl, checkAudioTools, cleanupAudio } from './youtubeservice.js';
import { Bot, registerExpressWebhook } from 'node-telegram-bot-api';

import { fromPath } from 'node-telegram-bot-api/node';
import { randomUUID } from 'node:crypto';

dotenv.config({ quiet: true });

for (const name of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET']) {
    if (!process.env[name]?.trim()) throw new Error(`Missing required environment variable: ${name}`);
}
await checkAudioTools();

const port = process.env.PORT || 3000;

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

registerExpressWebhook(bot, app, {
    path: '/telegrambot',
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET
});

bot.on('message', async (ctx) => {
    let filePath;
    const requestId = randomUUID();
    let stage = 'validating_message';
    const logStage = (value, extra = {}) => console.log(JSON.stringify({ requestId, stage: value, ...extra }));

    try {
        const text = ctx.message.text?.trim();
        if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text || '')) {
            const greeting = process.env.BOT_LOCAL_MODE === 'true'
                ? 'Hi! The local server is running. Paste your YouTube link and I’ll send you the audio download.'
                : 'Hi! Paste your YouTube link and I’ll send you the audio download.';
            await ctx.reply(greeting);
            return;
        }
        try {
            validateYouTubeUrl(text);
        } catch {
            await ctx.reply('Please send a valid HTTPS YouTube video link (youtube.com or youtu.be).');
            return;
        }
        stage = 'sending_download_notice';
        logStage(stage);
        await ctx.reply('Downloading your audio. Please wait...');
        stage = 'downloading_and_converting';
        filePath = await downloadAudio(text, { requestId });

        stage = 'preparing_telegram_document';
        logStage(stage);
        const document = await fromPath(filePath);
        stage = 'uploading_to_telegram';
        logStage(stage);
        await bot.api.sendDocument({
            chat_id: ctx.chat.id,
            document,
            caption: 'Your audio is ready! 🎵'
        });

        logStage('telegram_upload_complete');

    } catch (error) {

        console.error(JSON.stringify({ requestId, stage, event: 'request_failed',
            telegramErrorCode: Number.isInteger(error.errorCode) ? error.errorCode : null,
            reason: /file.*too (big|large)|request entity too large/i.test(error.description || '') ? 'telegram_file_too_large'
                : error.code === 'ETIMEOUT' ? 'telegram_request_timed_out'
                : error.code === 'EFETCH' ? 'telegram_network_error'
                : Number.isInteger(error.errorCode) ? 'telegram_api_rejected_request' : 'see_download_logs' }));

        try {
            const message = error.code === 'YOUTUBE_BOT_VERIFICATION_REQUIRED'
                ? 'YouTube is blocking downloads from this server and requires verification. The bot owner needs to check the server’s YouTube access.'
                : 'Sorry, the audio could not be delivered. The video may be unavailable or restricted. Please try again later.';
            await ctx.reply(message);
        } catch {
            console.error(JSON.stringify({ requestId, event: 'failure_reply_failed' }));
        }

    }
    finally {

        // Step 5: Delete temporary file
        if (filePath) {
            try {
                await cleanupAudio(filePath);
                logStage('temporary_files_removed');
            } catch {
                console.error(JSON.stringify({ requestId, event: 'cleanup_failed' }));
            }
        }
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
