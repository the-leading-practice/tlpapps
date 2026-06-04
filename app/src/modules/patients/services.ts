/**
 * Combined patient + appointment data-access services.
 * Ported from patient-service/src/services/patient.ts and appointment.ts.
 * Uses shared models from ../../models/.
 */
import { PatientModel as Patient } from '../../models/patient.js';
import { AppointmentModel as Appointment } from '../../models/appointment.js';
import { writePatient } from './helpers/dual-write-patient.js';
import type { PatientMapping, TLPAppointmentData, ApptData } from './types.js';

// ── Patient data service ────────────────────────────────────────────────────

const createPatientDataService = () => {
	const getPatients = async (locationId: string) => {
		const patients = await Patient.find({ locationId: locationId });
		return patients;
	};

	const getPatient = async (locationId: string, id: number): Promise<PatientMapping | null> => {
		const patient = await Patient.findOne({ locationId: locationId, patientId: id });

		if (patient) {
			console.log(`patient found ${patient.patientId}`);
			const mapping = {
				locationId: patient.locationId,
				patientId: patient.patientId,
				contactId: patient.contactId,
			};

			return mapping;
		}
		console.log(`no patient found`);

		return null;
	};

	const upsertPatient = async (locationId: string, patient: any) => {
		// Route through the dual-write helper: Mongo upsert (primary) + best-effort
		// PG shadow when PG_DUAL_WRITE_PATIENTS=on. Flag off => Mongo-only (unchanged).
		return writePatient({ op: 'upsert', locationId, mapping: { ...patient } });
	};

	return {
		getPatients,
		getPatient,
		upsertPatient,
	};
};

// ── Appointment data service ────────────────────────────────────────────────

const createAppointmentDataService = () => {
	const getAppointments = async (locationId: string) => {
		const appointments = await Appointment.find({ locationId: locationId });
		return appointments;
	};

	const getAppointment = async (
		locationId: string,
		apptId: number,
		calendarId: string | undefined = undefined,
		appt: ApptData | undefined = undefined,
	) => {
		const appointment = await Appointment.findOne({ locationId: locationId, apptId: apptId });
		let mapping: TLPAppointmentData | null = null;

		if (appointment) {
			mapping = {
				patientId: appointment.patientId,
				contactId: appointment.contactId,
				apptId: appointment.apptId,
				ghlApptId: appointment.ghlApptId,
				startTime: appointment.startTime,
				calendarId: appointment.calendarId,
				locationId: appointment.locationId,
				status: appointment.status || '',
			};
		}

		return mapping;
	};

	const upsertAppointment = async (appt: TLPAppointmentData) => {
		const query = { locationId: appt.locationId, apptId: appt.apptId };
		const newPatient = {
			apptId: appt.apptId,
			patientId: appt.patientId,
			contactId: appt.contactId,
			ghlApptId: appt.ghlApptId,
			locationId: appt.locationId,
			calendarId: appt.calendarId,
			startTime: appt.startTime,
			status: appt.status,
			reset: false,
		};

		const newDoc = await Appointment.findOneAndUpdate(query, newPatient, {
			upsert: true,
			new: true,
		});
		return newDoc;
	};

	return {
		getAppointments,
		getAppointment,
		upsertAppointment,
	};
};

export const patientDataService = createPatientDataService();
export const appointmentDataService = createAppointmentDataService();
