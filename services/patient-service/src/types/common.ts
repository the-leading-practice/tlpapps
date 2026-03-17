export type LocationSetting = {
	locHeader: string;
	calendarId: string;
	timezone: string;
	jwt: string;
	pushGHL: boolean;
	pushAppt: boolean;
	pushPat: boolean;
	software: string;
};

export type PatientMapping = {
	locationId: string;
	patientId: number;
	contactId: string;
};

export type TLPPatientData = {
	contactId?: string;
	patientId: number;
	firstName: string;
	lastName: string;
	address: string;
	address2: string;
	city: string;
	state: string;
	postalCode: string;
	country: string;
	timezone: string;
	phone: string;
	mobile: string;
	work: string;
	email: string;
	businessId?: string;
	dob: string;
};

export type ApptData = {
	apptId: number;
	patientId: number;
	apptTime: string;
	apptStatus: number | string;
};

export type TLPAppointmentData = {
	patientId: number;
	contactId?: string;
	apptId: number;
	ghlApptId?: string;
	startTime: string;
	status: string;
	address?: string;
	calendarId?: string;
	locationId?: string;
};

//  export type GHLAppointmentData = {
//   id?: string;
//   calendarId: string;
//   locationId: string;
//   contactId: string;
//   startTime: string;
//   appointmentStatus?: string;
//   endTime?: string;
//   title?: string;
//   toNotify?: boolean;
//   address?: string;
//  }
