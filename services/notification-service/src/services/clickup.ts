import { NotifyMessage } from '../types/common.js';
import { CLICKUP_API_KEY, CLICKUP_TEAM_ID, CLICKUP_CHANNEL_ID } from '../constants/constants.js';

const createClickupService = () => {
	const sendMessage = async (logMsg: NotifyMessage) => {
		const url = `https://api.clickup.com/api/v3/workspaces/${CLICKUP_TEAM_ID}/chat/channels/${CLICKUP_CHANNEL_ID}/messages`;

		const message = `# ${logMsg.severity.toUpperCase()}: ${logMsg.message}\n**Location:** ${logMsg.location}\n**Name:** ${logMsg.name}\n**TimeStamp:** ${logMsg.timestamp}`;

		const data = {
			type: 'message',
			content_format: 'text/md',
			content: message,
		};

		const options = {
			method: 'POST',
			headers: {
				Authorization: CLICKUP_API_KEY,
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(data),
		};

		const resp = await fetch(url, options);
		if (resp.status === 201) {
			console.log(`successfully created message`);
		} else {
			console.log(`there was an error creating message ${resp.status}`);
		}
	};

	return {
		sendMessage,
	};
};

export const clickupService = createClickupService();
