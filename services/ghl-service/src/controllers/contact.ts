import express from 'express';
import { contactService } from 'services/contact';
import { GHLAppointmentData, GHLContactData, TLPPatientData } from 'types/common';
import { getLocation } from 'utils/common';
import { translateGHLtoTLP, translateTLPtoGHL } from 'utils/patientUtils';

const createContactController = () => {

  const findContact = async ( req: express.Request, res: express.Response ) => {
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const loc = getLocation( locHeader );

    const query = req.params.query;

    // console.log( `GET findContact[${query}]` );
    // console.log( loc );

    if( loc.location ){
      const resp = await contactService.findContact( loc.location, loc.token, query ) as any;

      if( resp.status !== 200 || resp.data.contacts.length === 0 ) {
        return res.status( 404 ).json( {msg: 'no contacts found'} );
      }

      // translate GHL to TLP
      const contacts = resp.data.contacts;
      let tlpPatients: TLPPatientData[] = [];

      contacts.forEach( ( contact: GHLContactData ) => {
        const patient = translateGHLtoTLP( contact );
        tlpPatients.push( {...patient} );
      } );
      
      // send to requesting client
      return res.status( 200 ).json( tlpPatients );
    }

    return res.status( 404 );
  }

  const contact = async ( req: express.Request, res: express.Response ) => {
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const loc = getLocation( locHeader );
    const id = req.params.id;

    console.log( `GET contact contactid[${id}]` );

    if( loc.location && loc.token ){
      const resp = await contactService.getContact( id, loc.token ) as any;

      if( resp.status >= 400 ) {
        return res.status( resp.status ).json( {msg: 'no contacts found'} );
      }

      // translate GHL to TLP
      const tlpPatient = translateGHLtoTLP( resp.data.contact );

      // send to requesting client
      return res.status( resp.status ).json( tlpPatient );
    }

    return res.sendStatus( 403 );
  }

  const updateContact = async ( req: express.Request, res: express.Response ) => {
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const loc = getLocation( locHeader );

    const ghlContactId = req.params.id;
    const patient = {...req.body};

    console.log( `PUT updateContact contactid[${ghlContactId}]` );
    if( !patient.email || !patient.firstName || !patient.lastName || !patient.phone ) {
			console.log( 'missing some data' );
			return res.sendStatus( 400 );
		}

    if( !loc.location || !loc.token  ){
      return res.sendStatus( 401 );
    }
    
    if( loc.location.length === 0 || loc.token.length === 0 ) {
      return res.sendStatus( 401 );
    }

    // this is an update
    // translate from TLP format to GHL
    const ghlPatient = translateTLPtoGHL( patient, loc.location );

    // push the patient info to ghl as contact data
    // const resp = await contactService.upsertContact( ghlPatient, loc.token );
		const resp = await contactService.updateContact( ghlPatient, loc.token );

    // return status from ghl
    return res.status( resp.status ).json( resp );
    
  }

  const createContact = async( req: express.Request, res: express.Response ) => {
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const loc = getLocation( locHeader );

    // console.log( loc );

    const patient = {...req.body};
    console.log( `POST createContact ${patient.firstName} ${patient.lastName}` );

    if( !patient.firstName || !patient.lastName || !patient.phone ) return res.sendStatus( 400 );

    if( !loc.location || !loc.token  ){
      return res.sendStatus( 401 );
    }
    
    if( loc.location.length === 0 || loc.token.length === 0 ) {
      return res.sendStatus( 401 );
    }

    // this is a new contact
    // translate from TLP format to GHL
    const ghlPatient = translateTLPtoGHL( patient, loc.location );

    // push the patient info to ghl as contact data
    const resp = await contactService.upsertContact( ghlPatient, loc.token );

    if( resp.status >= 400 ) {
      console.log( resp.data );
      console.log( ghlPatient );
    }

    // return status and contactid
    return res.status( resp.status ).json( resp.data );

  }

  return {
    findContact,
    contact,
    updateContact,
    createContact
  };
}

export const contactController = createContactController();