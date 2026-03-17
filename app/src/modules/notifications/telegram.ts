import TelegramBot from 'node-telegram-bot-api';
import { config } from '../../config.js';

export type NotifyMessage = {
  location?: string;
  name?: string;
  timestamp: string;
  severity: 'Trace' | 'Debug' | 'Info' | 'Warn' | 'Error' | 'Fatal';
  message: string;
};

const createTelegramBotService = () => {
  let bot: TelegramBot | null = null;

  const _createBot = () => {
    if (config.telegram.botToken) {
      bot = new TelegramBot(config.telegram.botToken, { polling: true });
    }
  };

  const sendMessage = (logMsg: NotifyMessage) => {
    if (!bot) _createBot();

    const chatId = config.telegram.chatId;

    const message = `<b><u>${logMsg.severity.toUpperCase()}</u></b>: ${logMsg.message}
    <b>Location</b>: ${logMsg.location}
    <b>Name</b>: ${logMsg.name}
    <b>Timestamp</b>: ${logMsg.timestamp}`;

    if (bot) {
      bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }
  };

  return {
    sendMessage,
  };
};

export const telegramService = createTelegramBotService();
