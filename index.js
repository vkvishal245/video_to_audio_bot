
import app from './app.js';
import dotenv from 'dotenv';
import { downloadAudio, validateYouTubeUrl, checkAudioTools, cleanupAudio } from './youtubeservice.js';
import { Bot, registerExpressWebhook } from 'node-telegram-bot-api';

import { fromPath } from 'node-telegram-bot-api/node';

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

    try {
        const text = ctx.message.text?.trim();
        if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text || '')) {
            await ctx.reply('Hi! Paste your YouTube link and I’ll send you the audio download.');
            return;
        }
        try {
            validateYouTubeUrl(text);
        } catch {
            await ctx.reply('Please send a valid HTTPS YouTube video link (youtube.com or youtu.be).');
            return;
        }
        await ctx.reply('Downloading your audio. Please wait...');
        filePath = await downloadAudio(text);

        console.log('Audio downloaded:', filePath);
        const document = await fromPath(filePath);
        await bot.api.sendDocument({
            chat_id: ctx.chat.id,
            document,
            caption: 'Your audio is ready! 🎵'
        });

        console.log('Audio sent successfully!');

    } catch (error) {

        console.error('Audio request failed:', error.code || error.name);

        try {
            await ctx.reply('Sorry, the audio could not be delivered. The video may be unavailable or restricted. Please try again later.');
        } catch {
            console.error('Could not send the failure reply');
        }

    }
    finally {

        // Step 5: Delete temporary file
        if (filePath) {
            await cleanupAudio(filePath).catch((error) => {
                console.error('File cleanup error:', error.code || error.name);
            });

            console.log('Temporary file deleted');
        }
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
