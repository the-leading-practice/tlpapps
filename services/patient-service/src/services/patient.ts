import { Patient } from "models/patient";
import { PatientMapping } from "types/common";

const createPatientService = () => {

  const getPatients = async ( locationId: string ) => {
    const patients = await Patient.find( {LocationId: locationId} );
    return patients;
  }

  const getPatient = async ( locationId: string, id: number ): Promise<PatientMapping | null> => {
    const patient = await Patient.findOne( {locationId: locationId, patientId:id} );
    
    if( patient ) {
      console.log( `patient found ${patient.patientId}` );
      const mapping = {
        locationId: patient.locationId,
        patientId: patient.patientId,
        contactId: patient.contactId
      }

      return mapping;
    }
    console.log( `no patient found` );

    return null;
  }

  const upsertPatient = async ( locationId: string, patient: any ) => {
    const query = {locationId: locationId, patientId: patient.patientId};
    const newPatient = {...patient};

    const newDoc = await Patient.findOneAndUpdate( query, newPatient, {upsert: true, new: true} );
    return newDoc;
  }

  return {
    getPatients,
    getPatient,
    upsertPatient
  }
}

export const patientService = createPatientService();