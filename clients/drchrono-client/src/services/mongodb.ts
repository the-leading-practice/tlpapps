import mongoose from 'mongoose';
import { MONGO_DB_CONN_STRING, MONGO_DB } from 'lib/constants';

const createDbConnector = () => {
  const connect = () => {
    mongoose.connect( MONGO_DB_CONN_STRING )
      .then( () => {
        console.log( `connected to ${MONGO_DB}` );
      } )
      .catch( ( err ) => {
        console.error( `error connecting to ${MONGO_DB_CONN_STRING}` );
        console.log( err );
      } );
  }

  return {
    connect
  }
}

export const dbConnector = createDbConnector();
