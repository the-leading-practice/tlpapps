import { config } from '../../config.js';
import type { NotifyMessage } from './telegram.js';

const createClickupService = () => {
  const sendMessage = async (logMsg: NotifyMessage) => {
    const teamId = process.env.CLICKUP_TEAM_ID || '8555762';
    const channelId = process.env.CLICKUP_CHANNEL_ID || '8537j-130837';

    const url = `https://api.clickup.com/api/v3/workspaces/${teamId}/chat/channels/${channelId}/messages`;

    const message = `# ${logMsg.severity.toUpperCase()}: ${logMsg.message}\n**Location:** ${logMsg.location}\n**Name:** ${logMsg.name}\n**TimeStamp:** ${logMsg.timestamp}`;

    const data = {
      type: 'message',
      content_format: 'text/md',
      content: message,
    };

    const options = {
      method: 'POST',
      headers: {
        Authorization: config.clickup.apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    };

    const resp = await fetch(url, options);
    if (resp.status === 201) {
      console.log('successfully created message');
    } else {
      console.log(`there was an error creating message ${resp.status}`);
    }
  };

  return {
    sendMessage,
  };
};

export const clickupService = createClickupService();
