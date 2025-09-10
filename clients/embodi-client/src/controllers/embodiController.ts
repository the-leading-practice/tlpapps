import express from 'express';

const createEmbodiController = () => {
	const index = async (req: express.Request, res: express.Response) => {
		res.status(200).json({ status: 'ok' });
	};

	const getAvailability = async (req: express.Request, res: express.Response) => {
		// request availability for the desired location and date
	};

	const createAppointment = async (req: express.Request, res: express.Response) => {
		const data = { ...req.body };

		// translate data

		// send message to embodi
		// if failed post notification
	};

	const updateCalendar = async (req: express.Request, res: express.Response) => {
		const data = { ...req.body };

		// fire an availability grab here

		res.status(200).json({
			message: 'success',
		});
		res.send();
	};

	return {
		index,
		getAvailability,
		createAppointment,
		updateCalendar,
	};
};

export const embodiController = createEmbodiController();
