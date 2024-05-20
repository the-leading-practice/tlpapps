import { TLPPatientData } from 'types/common';
import { safeStringCompare } from './common';

export const verifyPatient = ( patient: TLPPatientData, contact: TLPPatientData ) => {
  // our main points of verification are email, name, and mobile phone
  // we will use these to determine if the patient we have from the practice
  // is the same as the one from GHL
  if( safeStringCompare( contact.email, patient.email ) && 
      safeStringCompare( contact.firstName, patient.firstName ) &&
      safeStringCompare( contact.lastName, patient.lastName ) &&
      safeStringCompare( contact.phone, patient.mobile ) &&
			safeStringCompare( contact.businessId, patient.patientId.toString() ) ) {
      return true;
  }

  return false;
}

// export const mergePatient = ( contact: GHLContactData, patient: TLPPatientData ) => {
//   const newContact: GHLContactData = {
//     id: contact.id,
//     locationId: contact.locationId,
//     firstName: patient.firstName,
//     lastName: patient.lastName,
//     name: `${patient.firstName} ${patient.lastName}`,
//     email: patient.email,
//     phone: patient.mobile || patient.phone,
//     address1: patient.address,
//     city: patient.city,
//     state: patient.state,
//     postalCode: patient.postalCode,
//     timezone: patient.timezone,
//     companyName: patient.patientId.toString(),
//     dnd: false
//   }

//   return newContact;
// }

// export const generateContact = ( location: string, patient: TLPPatientData ) => {
//   const contact: GHLContactData = {
//     id: "",
//     locationId: location,
//     firstName: patient.firstName,
//     lastName: patient.lastName,
//     name: `${patient.firstName} ${patient.lastName}`,
//     email: patient.email,
//     phone: patient.mobile || patient.phone,
//     address1: patient.address,
//     city: patient.city,
//     state: patient.state,
//     postalCode: patient.postalCode,
//     timezone: patient.timezone,
//     companyName: patient.patientId.toString(),
//     dnd: false
//   }

//   return contact;
// }