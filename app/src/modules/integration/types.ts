/**
 * GHL / integration types.
 * Ported from ghl-service/src/types/common.ts.
 */

export type CustomField = {
	id?: string;
	key?: string;
	field_value: string;
};

export type TLPPatientData = {
	contactId?: string;
	patientId: number;
	firstName: string;
	lastName: string;
	address?: string;
	address2?: string;
	city?: string;
	state?: string;
	postalCode?: string;
	country?: string;
	timezone?: string;
	phone?: string | null;
	home?: string | null;
	mobile?: string | null;
	work?: string | null;
	email?: string;
	dob?: string;
	tags?: string[];
	customFields?: CustomField[];
};

export type GHLContactData = {
	id?: string;
	locationId: string;
	name: string;
	firstName: string;
	lastName: string;
	companyName?: string;
	email?: string | null;
	phone?: string | null;
	dnd?: boolean;
	type?: string;
	source?: string;
	assignedTo?: string;
	city?: string;
	state?: string;
	postalCode?: string;
	address1?: string;
	dateAdded?: string;
	dateUpdated?: string;
	dateOfBirth?: string;
	businessId?: string;
	tags?: string[];
	country?: string;
	timezone?: string;
	additionalEmails?: string[];
	attributions?: [];
	customFields?: CustomField[];
};

export type TLPAppointmentData = {
	patientId: number;
	contactId?: string;
	apptId: number;
	ghlApptId: string;
	startTime: string;
	status: string;
	address?: string;
	calendarId?: string;
	locationId?: string;
	/** Loop-prevention origin tag forwarded into GHL appointment `notes`. */
	syncOriginTag?: string;
};

export type GHLAppointmentData = {
	id?: string;
	calendarId: string;
	locationId: string;
	contactId: string;
	startTime: string;
	appointmentStatus?: string;
	appoinmentStatus?: string;
	endTime?: string;
	title?: string;
	toNotify?: boolean;
	address?: string;
	/** Loop-prevention origin tag carried in GHL's `notes` field. */
	notes?: string;
};

export type GHLCalendarBlock = {
	calendarId: string;
	locationId: string;
	startTime: string;
	endTime: string;
};
