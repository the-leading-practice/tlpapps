import express from 'express';
import { integrationService } from 'services/integration';
import { patientService } from 'services/patient';
import { PatientMapping } from 'types/common';
import { getLocation } from 'utils/common';
import { verifyPatient } from 'utils/patientUtils';
import { deepEqual } from 'utils/common';
import { logger } from '../logger';

const createController = () => {
  const index = async ( req: express.Request, res: express.Response ) => {
    res.status( 200 ).json( { status: "ok" } );
  }
  
//--[ get all patients for location ]------------------------------------------
  const patients = async ( req: express.Request, res: express.Response ) => {
    console.log( `GET: patients` );
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const loc = getLocation( locHeader );

    if( loc.location ){
      let ret = await patientService.getPatients( loc.location );
      res.type( 'json' );
      return res.status( 200 ).json( ret );
    }

    return res.sendStatus( 404 );
  }

//--[ get single patient ]-----------------------------------------------------
  const patient = async ( req: express.Request, res: express.Response ) => {
    console.log( `GET: patient id[${req.params.id}]` );
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const loc = getLocation( locHeader );

    if( loc.location ) {
      let ret = await patientService.getPatient( loc.location, parseInt( req.params.id ) );
      res.type( 'json' );
      return res.status( 200 ).json( ret );
    }

    return res.sendStatus( 404 );
  }

//--[ create or update patient ]-----------------------------------------------
  const createPatient = async( req: express.Request, res: express.Response ) => {
    const reqData = {...req.body};
    let resp: any = {}

    const timezone = req.headers['x-tlp-app-timezone'] as string || "";
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const loc = getLocation( locHeader );

    const jwt = req.headers['x-tlp-app-jwt'] as string || "";
    const pushGHL = ( req.headers['x-tlp-app-pushghl'] !== undefined ); 
    const pushPat = ( req.headers['x-tlp-app-pushpat'] !== undefined ); 

    // no token and or location - no authorized
    if( !loc.location || !loc.token || loc.token.length <= 0 ) {
      res.sendStatus( 401 );
      return;
    }

    // no request body - nothing to do
    if( !reqData || reqData.length <= 0 ){
      logger.writeLog( 'warn', `bad request - no request body` );
      resp = {status: 400, msg: "bad request - no request body"};
      if( reqData.rquid ) {
        resp.rquid = reqData.rquid;
      }

      res.status( 400 ).json( resp );
      return;
    }

    resp.fail = [];
    resp.success = [];

    let idx = 0;

    console.log( `${loc.location} processing ${reqData.patients.length} patients...` );
    for( let patient of reqData.patients ) {
      logger.writeLog( 'debug', `processing ${patient.patientId} ${patient.firstName} ${patient.lastName} ${patient.email}` );

      if( !pushGHL || !pushPat) {
        console.log( `no push header found - eating data` );
        resp.success.push( {id: patient.patientId} );

        continue;
      }

      if( patient.timezone === undefined ) {
        patient.timezone = timezone
      }

      // can't do anything without a patientId
      if( !patient.patientId ) {
        logger.writeLog( 'warn', `unprocessable entity - no patientId` );
        resp.fail.push( {index: idx, status: 422, message: "unprocessable entity - no patientId"} );
        
        continue;
      }

      // do some twisting if there is no phone property
      if( !patient.phone || patient.phone.length === 0 ) {
        if( patient.mobile && patient.mobile.length > 0 ) {
          patient.phone = patient.mobile;
          patient.mobile = null;
        }
      }

      // let's see if we have a mapping
      let isNewMapping = false;

      // check for mapping in mongo
      let mapping: PatientMapping | null = await patientService.getPatient( loc.location, patient.patientId );
      let verifiedContact : any = null;

      if( !mapping ) {
        // dont have one so we will just build our mapping object
        isNewMapping = true;
        logger.writeLog( 'debug', `no mapping found for: ${patient.patientId}` );
        const newMapping = {
          locationId: loc.location,
          patientId: patient.patientId,
          contactId: ""
        };

        // we don't have a mapping so we need to check GHL for existing patient
        const contacts = await integrationService.findContact( patient, jwt );
        console.log( contacts );
        if( contacts && Array.isArray( contacts.data ) && contacts.data.length > 0 ) {
          contacts.data.forEach( ( contact: any ) => {
            if( verifyPatient( patient, contact ) ) {
              logger.writeLog( 'debug', `found verified ${patient.patientId} contact ${contact.contactId}` );
              verifiedContact = contact;

              newMapping.contactId = contact.contactId;
              return;
            }
          } );
        }

        mapping = {...newMapping};
      }
      else {
        logger.writeLog( 'debug', `mapping found for: ${patient.patientId}` );
        logger.writeLog( 'debug', `get contact by id ${mapping.contactId}` );
        const data = await integrationService.getContact( mapping.contactId, jwt );
        console.log( data.data );
        if( data.status === 200 ) {
          verifiedContact = data.data;
          logger.writeLog( 'debug', `found GHL contact ${verifiedContact.firstName} ${verifiedContact.lastName}` );
          patient.contactId = verifiedContact.contactId; // add this bit to our patient data
        }
        else {
          // the mapping we have no longer exists at GHL so we will need to reassign
          mapping.contactId = "";
        }
      }

      let needUpdate = false;
      if( verifiedContact ) { // this should exist - either via db or creating a new one.
        // is this an exact copy

        // we have a GHL contact and patient - let's merge
        logger.writeLog( 'debug', `verified contact found - checking data to see if update is required ${patient.patientId} to ${mapping.contactId}` );
        if( !deepEqual( patient, verifiedContact, ['patientId', 'tags'] ) ) {
          logger.writeLog( 'debug', `data has changed - sending update to GHL ${patient.patientId}` );

          needUpdate = true;
        }
      }
      else {
        // brand new
        logger.writeLog( 'debug', `creating new GHL contact for ${patient.patientId}` );

      }

      // new patient
      if( mapping && mapping.contactId.length === 0 ) {
        // we need to get a GHL contactId - lets do that
        logger.writeLog( 'debug', `integrationService.createContact ${patient.patientId}` );
        const contactResp = await integrationService.createContact( patient, jwt );

        if( contactResp.status >= 200 && contactResp.status < 300 ) {
          // successfull add to GHL
          logger.writeLog( 'debug', `${patient.patientId} new ghl contactid ${contactResp.data.contact.id}` );
          mapping.contactId = contactResp.data.contact.id;
          resp.success.push( {id: patient.patientId} );
        }
        else {
          // resp.fail.push( {id: patient.patientId, status: contactResp.status, message: contactResp.data} );
          resp.success.push( {id: patient.patientId} );
          logger.writeLog( 'warn', `error: code ${contactResp.status} response ${contactResp.data}` );
          logger.writeLog( 'warn', logger.addSlashes( JSON.stringify( patient ) ) );
        }
      }
      
      // existing patient
      else if( mapping && mapping.contactId.length > 0 ) {
        if( needUpdate ) {
          // this is an existing patient update at ghl
          logger.writeLog( 'debug', `integrationService.upsertContact ${patient.patientId}` );
          const contactResp = await integrationService.upsertContact( patient, jwt );

          if( contactResp.status >= 200 && contactResp.status < 300 ) {
            logger.writeLog( 'debug', `${patient.patientId} ghl contact updated contactId: ${mapping.contactId}` );
            resp.success.push( {id: patient.patientId} );
          }
          else {
            // resp.fail.push( {id: patient.patientId, status: contactResp.status, message: contactResp.data} );
            resp.success.push( {id: patient.patientId} );
            logger.writeLog( 'warn', `error: code ${contactResp.status} response ${contactResp.data}` );
            logger.writeLog( 'warn', logger.addSlashes( JSON.stringify( patient ) ) );
          }
        }
        else {
          resp.success.push( {id: patient.patientId} );
          logger.writeLog( 'debug', `${patient.patientId} has not changed - moving to the next` );
        }
      }

      if( isNewMapping ) {
        // this is a new map - we will add it now
        logger.writeLog( 'debug', `adding new patient mapping ${mapping.contactId} ${mapping.patientId}` );
        const patientResp = await patientService.upsertPatient( loc.location, mapping );
      }

      idx++;
    };

    let retStatus = 200;
    resp.status = "success";
    resp.message = `${resp.success.length} records succeeded, ${resp.fail.length} records failed`;

    logger.writeLog( 'debug', `${resp.success.length} records succeeded, ${resp.fail.length} records failed` );
    console.log( `${resp.success.length} records succeeded, ${resp.fail.length} records failed` );
    
    if( resp.success.length <= 0 ) {
      // no valid records
      resp.status = "failed";
      resp.message = "no valid records";
      retStatus = 400;
    }

    if( reqData.rquid ) {
      resp.rquid = reqData.rquid;
    }

    // store date and time
    return res.status( retStatus ).json( resp );
  }

//--[ update specific patient record ]------------------------------------------  
  const updatePatient = async( req: express.Request, res: express.Response ) => {
    const reqData = req.body;
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const loc = getLocation( locHeader );

    if( !loc.location ) {
      res.sendStatus( 400 );
      return;
    }

    if( reqData === undefined ){
      res.status( 400 ).json( {status:"malformed request"} );
      return;
    }

    if( reqData.contactId=== undefined ){
      res.status( 400 ).json( {status:"malformed request"} );
      return;
    }

    let ret = await patientService.getPatient( loc.location, parseInt( req.params.id ) );

    if( !ret ) {
      res.status( 404 ).json( { status: "not found" } );
      return;
    }

    // update here
    res.status( 200 ).json( reqData );
  }

  const deletePatient = async ( req: express.Request, res: express.Response ) => {
    const id = req.params.id;
    const ids = id.split(',');

    // if( ids.length > 1 ) {
    //   console.log( `id array from query: ` );
    //   ids.forEach( (i) => console.log( `  id: ${i}` ) );
    // }
    // else console.log( `id from query: ${id}` );
    
    // TODO - mark the record as inactive here

    return res.sendStatus( 200 );
  }

  return {
    index,
    patients,
    patient,
    createPatient,
    updatePatient,
    deletePatient
  };
}

export const patientController = createController();