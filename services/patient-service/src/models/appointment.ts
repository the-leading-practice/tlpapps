import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
	apptId: { type: Number, required: true },
	patientId: { type: Number, required: true },
	contactId: { type: String, required: true },
	ghlApptId: { type: String, required: true },
	locationId: { type: String, required: true },
	calendarId: { type: String, required: true },
	startTime: { type: String, required: true },
	status: { type: String, required: false },
	reset: { type: Number, required: false },
});

export const Appointment = mongoose.model('Appointment', appointmentSchema);
