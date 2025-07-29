import jwt from 'jsonwebtoken';
import { TOKEN_KEY } from 'constants/constants';

// TODO - lockdown the services using the JWT aud claim
// TODO - research positives of using asymmetric keys for encryption

export const authToken = (req: any, res: any, next: any) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];

	if (!token) return res.sendStatus(401);

	jwt.verify(token, TOKEN_KEY, (err: any, payload: any) => {
		if (err) return res.sendStatus(403);

		console.log(`passed jwt`);
		// console.log( token );

		req.payload = payload;
		req.jwt = token;
		next();
		return;
	});
};
