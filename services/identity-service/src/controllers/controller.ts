import express from 'express';
import { ghlTokenService } from 'services/ghltoken';
import { cryptoService } from 'services/crypto';
import { accessTokenService } from 'services/accessToken/service';
import { appConfigService } from 'services/appConfig/service';
import jwt from 'jsonwebtoken';
import { TOKEN_KEY } from 'constants/constants';
import type { AccessToken, LoginData, Token } from 'types/types';
import { access } from 'fs';

const createController = () => {
	const index = async (req: any, res: express.Response) => {
		res.status(200).json({ status: 'ok' });
	};

	const login = async (req: any, res: express.Response) => {
		const { location, secret } = req.body;
		console.log(`new login request`);
		console.log(req.body);

		const token = await accessTokenService.getToken(location, secret);

		if (token && token.token) {
			console.log(`token found for location ${location}`);

			const buf = Buffer.from(token.token, 'hex');
			const json = cryptoService.decrypt(buf);

			// renew token
			console.log(`renewing token - default action for phase 1`);
			const accessToken: Token = JSON.parse(json);
			const refToken = await ghlTokenService.renewAuthToken(accessToken.refresh_token);

			console.log(`access token: `);
			console.log(accessToken.access_token);

			console.log(`refresh token: `);
			console.log(refToken);

			if (refToken.status >= 400) {
				res.status(refToken.status).send(refToken.data);
				return;
			}

			let encToken = '';
			if (refToken.status > -1) {
				// check for timezone
				if (!token.timezone || token.timezone.length === 0) {
					token.timezone = '';

					console.log('grabbing location data');
					const locationData = await ghlTokenService.getLocationData(
						token.location,
						refToken.data.access_token,
					);
					token.timezone = locationData.data.location.timezone;
				}

				// encrypt the new token and store it
				console.log(`renew successfull - encrypting and storing`);
				encToken = cryptoService.encrypt(JSON.stringify(refToken.data));
			} else {
				// we had a network communication error with GHL
				// recycle the current token
				console.log(`communication error with GHL - recycling existing token`);
				encToken = token.token;
			}

			const updateToken: AccessToken = {
				location: location,
				name: token.name,
				calendar: token.calendar,
				timezone: token.timezone,
				secret: secret,
				token: encToken,
				pushGHL: token.pushGHL || false,
				pushAppt: token.pushAppt || false,
				pushPat: token.pushPat || false,
				software: token.software,
			};

			if (refToken.status > -1) {
				accessTokenService.updateToken(updateToken);
			}

			// generate jwt
			console.log(`generating jwt`);
			const webToken = jwt.sign(
				{
					location: location,
					calendar: token.calendar,
					timezone: token.timezone,
					name: token.name,
					token: refToken.data.access_token,
					pushGHL: token.pushGHL,
					pushAppt: token.pushAppt,
					pushPat: token.pushPat,
					software: token.software,
				},
				TOKEN_KEY,
				{ expiresIn: '86400s' },
			);

			// get the config for this location
			console.log(`getting config for location ${location}`);
			const conf = await appConfigService.getConfig(location);

			console.log(conf);

			if (conf && webToken) {
				console.log(`sending jwt back to client`);
				console.log(webToken);
				const ret = {
					config: conf.config,
					token: webToken,
				};

				res.status(200).json(ret);
				return;
			}

			res.status(200).json({});
			return;
		}

		res.sendStatus(403);
	};

	const auth = async (req: express.Request, res: express.Response) => {
		const { location, secret } = req.body;
		console.log(`new login request - auth`);
		console.log(req.body);

		const token = await accessTokenService.getToken(location, secret);

		if (token && token.token) {
			console.log(`token found for location ${location}`);

			const buf = Buffer.from(token.token, 'hex');
			const json = cryptoService.decrypt(buf);
			const accessToken: Token = JSON.parse(json);

			console.log(`access token: `);
			console.log(accessToken.access_token);

			console.log(`refresh token: `);
			console.log(accessToken.refresh_token);

			// check for timezone
			if (!token.timezone || token.timezone.length === 0) {
				token.timezone = '';

				console.log('grabbing location data');
				const locationData = await ghlTokenService.getLocationData(
					token.location,
					accessToken.access_token,
				);
				token.timezone = locationData.data.location.timezone;
			}

			// generate jwt
			console.log(`generating jwt`);
			const webToken = jwt.sign(
				{
					location: location,
					calendar: token.calendar,
					timezone: token.timezone,
					name: token.name,
					token: accessToken.access_token,
					pushGHL: token.pushGHL,
					pushAppt: token.pushAppt,
					pushPat: token.pushPat,
					software: token.software,
				},
				TOKEN_KEY,
				{ expiresIn: '86400s' },
			);

			console.log(`token: ${accessToken.access_token}`);

			// get the config for this location
			console.log(`getting config for location ${location}`);
			const conf = await appConfigService.getConfig(location);

			if (conf && webToken) {
				console.log(`sending jwt back to client`);
				console.log(webToken);
				const ret = {
					config: conf.config,
					token: webToken,
				};

				res.status(200).json(ret);
				return;
			}

			res.status(200).json({});
		}

		res.sendStatus(403);
	};

	const oauth = async (req: express.Request, res: express.Response) => {
		console.log('GET to /oauth');
		// console.log( req.query );

		// get code
		const ghlCode = req.query.code;
		if (typeof ghlCode === 'undefined' || ghlCode.length === 0) {
			res.sendStatus(400);
			return;
		}

		// get token
		ghlTokenService.getAccessToken(ghlCode as string).then(async (msg) => {
			// encrypt token for long term storage
			const encToken = cryptoService.encrypt(JSON.stringify(msg));
			const secret = cryptoService.getNewSecret();
			const locationId = msg.data.locationId;

			// TODO - hash the secret for storage in the database
			const existingToken = await accessTokenService.getTokenByLocation(locationId);

			let name = existingToken ? existingToken.name : '';
			const calendar = existingToken ? existingToken.calendar : 'need-calendar-id';
			let timezone = existingToken ? existingToken.timezone : '';
			const pushGHL = existingToken && existingToken.pushGHL ? existingToken.pushGHL : false;
			const pushAppt = existingToken && existingToken.pushAppt ? existingToken.pushAppt : false;
			const pushPat = existingToken && existingToken.pushPat ? existingToken.pushPat : false;
			const software = existingToken && existingToken.software ? existingToken.software : 'unknown';

			if (!existingToken) {
				// we need to get the data for this practice
				// get location data from ghl
				const locationData = await ghlTokenService.getLocationData(
					locationId,
					msg.data.access_token,
				);

				name = locationData.data.location.name;
				timezone = locationData.data.location.timezone;
			}

			if (timezone.length === 0) {
				const locationData = await ghlTokenService.getLocationData(
					locationId,
					msg.data.access_token,
				);
				timezone = locationData.data.location.timezone;
			}

			const updateToken: AccessToken = {
				location: locationId,
				name: name,
				calendar: calendar,
				timezone: timezone,
				secret: secret,
				token: encToken,
				pushGHL: pushGHL,
				pushAppt: pushAppt,
				pushPat: pushPat,
				software: software,
			};
			const access = await accessTokenService.updateToken(updateToken);

			// send reponse
			res.status(200);
			res.set('Content-Security-Policy', 'img-src https://media.theleadingpractice.com');
			res.render('oauth', {
				locationId: access.location,
				locationSecret: access.secret,
			});
		});
	};

	return {
		index,
		login,
		auth,
		oauth,
	};
};

export const controller = createController();
