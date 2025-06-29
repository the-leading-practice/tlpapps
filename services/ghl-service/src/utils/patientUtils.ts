import { GHLContactData, TLPPatientData } from 'types/common';
import { safeStringCompare } from './common';
import { GHL_CUSTOM_FIELD_ID } from 'constants/constants';

export const verifyPatient = ( patient: TLPPatientData, contact: GHLContactData ) => {
  // our main points of verification are email, name, and mobile phone
  // we will use these to determine if the patient we have from the practice
  // is the same as the one from GHL
  if( safeStringCompare( contact.email as string, (patient.email || "") ) && 
      safeStringCompare( contact.firstName, patient.firstName ) &&
      safeStringCompare( contact.lastName, patient.lastName ) &&
      safeStringCompare( contact.phone as string, (patient.mobile || "") ) ) {
      return true;
  }

  return false;
}

export const getPatientPhone = ( patient: TLPPatientData ): string => {
  const props = [
    'mobile', 'phone', 'home', 'work'
  ];

  let phone = '';
  for( let p of props ) {
    const key = p;
    console.log( `checking ${key} ${(patient as any)[key]}` );
    if( (patient as any)[key] && (patient as any)[key].length > 0 ){
      phone = (patient as any)[key];
      console.log( `found value in ${key}` );

      break;
    }
  }

  return phone;
}

export const translateTLPtoGHL = ( patient: TLPPatientData, location: string ): GHLContactData => {
  console.log( patient );
  // const phone = getPatientPhone( patient );

  const contact: GHLContactData = {
    locationId: location,
    firstName: patient.firstName,
    lastName: patient.lastName,
    name: `${patient.firstName} ${patient.lastName}`,
    address1: patient.address,
    city: patient.city,
    state: patient.state,
    postalCode: patient.postalCode,
    timezone: patient.timezone,
    companyName: `${patient.patientId}`,
    tags: ["API", "Existing Patient"],
    dnd: false,
		customFields: [
			{
				id: GHL_CUSTOM_FIELD_ID,
				field_value: `${patient.patientId}`
			}
		]
  }

	if( patient.contactId ) {
		contact.id = patient.contactId;
	}

  if( patient.email && patient.email.trim().length > 0 ) {
    contact.email = patient.email;
  }

  if( patient.phone && patient.phone.length > 0 ) {
    contact.phone = patient.phone;
  }

  return contact;
}

export const translateGHLtoTLP = ( contact: GHLContactData ): TLPPatientData => {
  const tlpPatient: TLPPatientData = {
    contactId: contact.id,
    patientId: -1,
    firstName: contact.firstName,
    lastName: contact.lastName,
    address: contact.address1,
    city: contact.city,
    state: contact.state,
    postalCode: contact.postalCode,
    country: contact.country,
    timezone: contact.timezone,
    phone: contact.phone || '',
    mobile: null,
    home: null,
    work: null,
    email: contact.email || '',
    dob: contact.dateOfBirth,
    tags: contact.tags
  }

	if( contact.customFields ) {
		tlpPatient.customFields = contact.customFields;
	}

  // TODO - may move to this procedural solution - we will be deliberate for now
  // assign common properties
  // for( let key in contact ) {
  //   if( key in patient ) {
  //     con[key] = pat[key];
  //   }
  // }

  // return {...con};

  return tlpPatient;
}