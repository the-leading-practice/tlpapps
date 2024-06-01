import express from 'express';
import { dockerService } from 'services/docker';

const createController = () => {

  const index = ( req: express.Request, res: express.Response ) => {
    console.log( req.body );
    res.status( 200 ).json( req.body );
  }

	const list = async ( req: express.Request, res: express.Response ) => {
		console.log( req.body );
    console.log( req.headers );

		const resp = await dockerService.list();
		res.status( resp.status ).send( resp.data );
  }

  const info = async ( req: express.Request, res: express.Response ) => {
    console.log( req.headers );

		const resp = await dockerService.info();
		res.status( resp.status ).send( resp.data );
  }

	const stats = async ( req: express.Request, res: express.Response ) => {
		const id = req.params.id;
		console.log( req.headers );

		const resp = await dockerService.stats( id );
		res.status( resp.status ).send( resp.data );
	}

  return {
    index,
		list,
    info,
		stats
  };
}

export const controller = createController();