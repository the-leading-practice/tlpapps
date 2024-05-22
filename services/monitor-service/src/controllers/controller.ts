import express from 'express';
import { dockerService } from 'services/docker';

const createController = () => {

  const index = ( req: express.Request, res: express.Response ) => {
    console.log( req.body );
    res.status( 200 ).json( req.body );
  }

  const info = async ( req: express.Request, res: express.Response ) => {
    console.log( req.body );
    console.log( req.headers );

		const data = dockerService.info();
		console.log( data );

    res.sendStatus( 200 );
  }

	const stats = ( req: express.Request, res: express.Response ) => {
		console.log( req.body );
		console.log( req.headers );

		res.sendStatus( 200 );
	}

  return {
    index,
    info,
		stats
  };
}

export const controller = createController();