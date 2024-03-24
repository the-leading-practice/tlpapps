import { GHL_API_VERSION, GHL_API_URL } from "constants/constants";
import { GHLAppointmentData, GHLContactData, TLPPatientData } from "types/common";


const createContactService = () => {

  const getContact = async ( id: string, token: string ) => {
    const opts = {
      method: "GET",
      headers: {
        "authorization": `Bearer ${token}`,
        "version": GHL_API_VERSION
      }
    }
    console.log( `${GHL_API_URL}/contacts/${id}` );
    const response = await fetch( `${GHL_API_URL}/contacts/${id}`, opts );
    const json = await response.json();

    return {status: response.status, data: json};
  }

  const findContact = async ( location: string, token: string, query: string ) => {
    const opts = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "authorization": `Bearer ${token}`,
        "version": GHL_API_VERSION
      }
    }

    const response = await fetch( `${GHL_API_URL}/contacts/?locationId=${location}&query=${query}`, opts );
    const json = await response.json();

    return {status: response.status, data: json};
  }

  const updateContact = async( patient: GHLContactData, token: string ) => {
    const opts = {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "authorization": `Bearer ${token}`,
        "version": GHL_API_VERSION
      },
      body: JSON.stringify( patient )
    }

    const resp = await fetch( `${GHL_API_URL}/contacts/${patient.id}`, opts );
    
    if( resp.status > 100 && resp.status < 300 ) {
      const json = await resp.json();
      return {status: resp.status, data: json};
    }

    return {status: resp.status, data:null};
  }

  const createContact = async( patient: GHLContactData, token: string ) => {
    const opts = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "authorization": `Bearer ${token}`,
        "version": GHL_API_VERSION
      },
      body: JSON.stringify( patient )
    }

    const resp = await fetch( `${GHL_API_URL}/contacts/`, opts );
    
    if( resp.status >= 200 && resp.status < 300 ) {
      const json = await resp.json();
      return {status: resp.status, data: json};
    }

    return {status: resp.status, data: resp.statusText};
  }

  const upsertContact = async( patient: GHLContactData, token: string ) => {
    console.log( patient );
    const opts = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "authorization": `Bearer ${token}`,
        "version": GHL_API_VERSION
      },
      body: JSON.stringify( patient )
    }

    const resp = await fetch( `${GHL_API_URL}/contacts/upsert`, opts );
  
    if( resp.status >= 200 && resp.status < 300 ) {
      const json = await resp.json();
      return {status: resp.status, data: json};
    }
    else {
      const json = await resp.text();
      return {status: resp.status, data: json};
    }
  }

  return {
    getContact,
    findContact,
    updateContact,
    createContact,
    upsertContact,
  }
}

export const contactService = createContactService();