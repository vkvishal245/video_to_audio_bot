
import app from './app.js';
import dotenv from 'dotenv';
import { downloadAudio } from './youtubeservice.js'
import { Bot, registerExpressWebhook } from 'node-telegram-bot-api';

import { fromPath } from 'node-telegram-bot-api/node';

import fs from 'node:fs/promises';

dotenv.config();

const port = process.env.PORT || 3000;

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

registerExpressWebhook(bot, app, {
    path: '/telegrambot',
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET
});

bot.on('message', async (ctx) => {
    console.log('Received message:', ctx.message.text);
    let filePath;

    try {
        await ctx.reply('Downloading your audio. Please wait...');
        filePath = await downloadAudio(ctx.message.text);

        console.log('Audio downloaded:', filePath);
        const document = await fromPath(filePath);
        await bot.api.sendDocument({
            chat_id: ctx.chat.id,
            document,
            caption: 'Your audio is ready! 🎵'
        });

        console.log('Audio sent successfully!');

    } catch (error) {

        console.error('Download error:', error);

        await ctx.reply(
            `Sorry, something went wrong: ${error.message}`
        );

    }
    finally {

        // Step 5: Delete temporary file
        if (filePath) {
            await fs.unlink(filePath).catch((error) => {
                console.error('File cleanup error:', error.message);
            });

            console.log('Temporary file deleted');
        }
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
