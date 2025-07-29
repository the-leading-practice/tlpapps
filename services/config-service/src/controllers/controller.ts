import express from 'express';
import { configMongoService } from 'services/config/configService';

const createController = () => {
	const index = (req: express.Request, res: express.Response) => {
		const ret = {
			message: 'success',
			code: '200',
		};

		res.status(200).json(ret);
	};

	const getAllConfigs = async (req: express.Request, res: express.Response) => {
		const ret = await configMongoService.getAllConfigs();

		res.status(200).json(ret);
	};

	const getConfig = async (req: express.Request, res: express.Response) => {
		const location = req.params.location;
		if (!location) return res.status(400).json({ status: 'invalid format: missing location' });

		const ret = await configMongoService.getConfig(location);
		if (!ret) return res.sendStatus(404);

		return res.status(200).json(ret);
	};

	const updateConfig = async (req: express.Request, res: express.Response) => {
		const location = req.params.location;
		const newConfig = { ...req.body };

		if (newConfig._id) delete newConfig._id;

		if (!newConfig) return res.sendStatus(400);
		if (!location) return res.sendStatus(400);

		const config = await configMongoService.updateConfig(location, newConfig);
		return res.status(200).json(config);
	};

	return {
		index,
		getAllConfigs,
		getConfig,
		updateConfig,
	};
};

export const controller = createController();
