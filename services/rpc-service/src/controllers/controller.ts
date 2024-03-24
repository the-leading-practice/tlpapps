import express from 'express';

const createController = () => {

  const index = ( req: express.Request, res: express.Response ) => {
    console.log( req.body );
    console.log( req.headers['x-tlp-app-location'] );

    res.status( 200 ).json( {} );
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
    sample
  };
}

export const controller = createController();