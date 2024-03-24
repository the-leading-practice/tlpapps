import bunyan from 'bunyan';
import express from 'express';
import { NotifyMessage } from 'types/common';
import { getLocation } from 'utils/common';
import { telegramService } from 'services/telegram';
import { TELEGRAM_BOT_LEVEL } from 'constants/constants';

const _getSeverityIndex = ( severity: string ) => {
  const sevArray = ['trace','debug','info','warn','error','fatal'];
  const idx = sevArray.findIndex( (sev) => sev === severity );

  return idx;
}

const createController = () => {

  const tgLevel = _getSeverityIndex( TELEGRAM_BOT_LEVEL );

  const index = ( req: express.Request, res: express.Response ) => {
    const ret = {
      message: "success",
      code: "200"
    }

    res.status( 200 ).json( ret );
  }

  const notify = ( req: express.Request, res: express.Response, log: bunyan ) => {
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const nameHeader = req.headers['x-tlp-app-name'] as string || '';

    const loc = getLocation( locHeader );

    if( !loc.location || !loc.token ) return res.sendStatus( 401 );

    const logMsg: NotifyMessage = req.body;
    console.log( logMsg );

    logMsg.location = loc.location;
    
    if( nameHeader.length > 0 ) {
      logMsg.name = nameHeader;
    }

    // log message
    switch( logMsg.severity.toLowerCase() ) {
      case 'trace': 
      case 'debug': log.debug( logMsg.message ); break;
      case 'info': log.info( logMsg.message ); break;
      case 'warn': log.warn( logMsg.message ); break;
      case 'error': log.error( logMsg.message ); break;
      case 'fatal': log.fatal( logMsg.message ); break;
    }
    
    const sev = _getSeverityIndex( logMsg.severity.toLowerCase() );

    if( sev >= tgLevel ) {
      // send to tg
      telegramService.sendMessage( logMsg );
    }

    return res.sendStatus( 200 );
  }

  return {
    index,
    notify
  };
}

export const controller = createController();