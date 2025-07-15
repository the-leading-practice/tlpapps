import fs from 'fs';
import path from 'path';
import bunyan from 'bunyan';
import RotatingFileStream from 'bunyan-rotating-file-stream';
import { LOG_PATH, LOG_LEVEL, LOG_FILE_NAME, LOG_TO_CONSOLE, LOG_KEEP_FILES } from 'constants/constants'

const createLogger = () => {
  // create logger
  const fullLogPath = path.join( LOG_PATH, LOG_FILE_NAME );
  if( fullLogPath.length > 0 ) {
    if( !fs.existsSync( LOG_PATH ) ) {
      fs.mkdirSync( LOG_PATH, { recursive: true } );
    }

    if( !fs.existsSync( fullLogPath ) ) {
      console.log( `need to create file` );
      fs.writeFileSync( fullLogPath, "" );
    }
  }
  
  const log = bunyan.createLogger( {
    name: "patient-service",
    streams: [
      {
        level: LOG_LEVEL as bunyan.LogLevel,
        stream: new RotatingFileStream( {
          path: fullLogPath,
          period: '1d',
          totalFiles: LOG_KEEP_FILES,
          gzip: true
        } ) as NodeJS.WritableStream
      }
    ]
  } );
  
  const writeLog = ( level: bunyan.LogLevel, message: string ) => {
    if( !log ) return;

    switch( level ) {
      case "trace": log.trace( message ); break;
      case "debug": log.debug( message ); break;
      case "info": log.info( message ); break;
      case "warn": log.warn( message ); break;
      case "error": log.error( message ); break;
      case "fatal": log.fatal( message ); break;
    }

    if( LOG_TO_CONSOLE ) {
      console.log( `[${level}] ${message}` );
    }
  }

  const addSlashes = ( message: string, whitespace: boolean = false ) => {
    let ret = message;
    ret = ret.replace(/\\/g, '\\\\').
        replace(/'/g, '\\\'').
        replace(/"/g, '\\"');

    if( whitespace ) {
      ret = ret.replace(/\u0008/g, '\\b').
        replace(/\t/g, '\\t').
        replace(/\n/g, '\\n').
        replace(/\f/g, '\\f').
        replace(/\r/g, '\\r')
    }

    return ret;
}

  return {
    writeLog,
    addSlashes
  }
}

export const logger = createLogger();