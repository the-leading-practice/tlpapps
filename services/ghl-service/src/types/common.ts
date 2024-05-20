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
	businessId?: string;
  dob?: string;
  tags?: string[];
}

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
  customFields?: [];
}

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
}

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
}
