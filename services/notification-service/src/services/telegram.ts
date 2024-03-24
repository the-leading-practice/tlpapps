import TelegramBot from "node-telegram-bot-api";
import { TELEGRAM_BOT_KEY, TELEGRAM_BOT_GROUP_ID } from "constants/constants";
import { NotifyMessage } from "types/common";

const createTelegramBotService = () => {
  let bot: TelegramBot | null = null;

  const _createBot = () => {
    bot = new TelegramBot( TELEGRAM_BOT_KEY, {polling: true} );
  }

  const sendMessage = ( logMsg: NotifyMessage ) => {
    if( !bot ) _createBot();

    const chat_id = TELEGRAM_BOT_GROUP_ID;
    // let color;

    // switch( logMsg.severity.toLowerCase() ) {
    //   case 'warn': color = 'orange'; break;
    //   case 'error': color = 'red'; break;
    //   case 'fatal': color = 'darkred'; break;
    // };

    const message = `<b><u>${logMsg.severity.toUpperCase()}</u></b>: ${logMsg.message}
    <b>Location</b>: ${logMsg.location}
    <b>Name</b>: ${logMsg.name}
    <b>Timestamp</b>: ${logMsg.timestamp}`;

    if( bot ) {
      bot.sendMessage( chat_id, message, { parse_mode: 'HTML' } );
    }
  }

  return {
    sendMessage
  }
}

export const telegramService = createTelegramBotService();