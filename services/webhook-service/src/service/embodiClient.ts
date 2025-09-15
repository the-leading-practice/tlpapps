const createEmbodiClient = () => {
	const createAppointment = async (appointmentData: any) => {
		const url = 'http://embodi-client:5690/embodi/calendar/createdAppointment';

		const options = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(appointmentData),
		};

		const res = await fetch(url, options);
		return res.status;
	};

	return {
		createAppointment,
	};
};

export const embodiClient = createEmbodiClient();
