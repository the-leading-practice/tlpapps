import express from 'express';

const createController = () => {

  const index = ( req: express.Request, res: express.Response ) => {
    console.log( req.body );
    console.log( req.headers['x-tlp-app-location'] );

    res.status( 200 ).json( req.body );
  }

  const hook = ( req: express.Request, res: express.Response ) => {
    console.log( req.body );
    console.log( req.headers );

    res.sendStatus( 200 );
  }

  const sample = ( req: express.Request, res: express.Response ) => {
    const ret = {
      message: "success",
      code: 200,
      page: "sample"
    }

    res.status( 200 ).json( ret );
  }

  return {
    index,
    hook,
    sample
  };
}

export const controller = createController();