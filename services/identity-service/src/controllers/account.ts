import express from 'express';
import { cryptoService } from 'services/crypto';
import type { LoginData } from 'types/types';
import { accountService } from 'services/account/service';

const createAccountController = () => {
  const signin = async( req: express.Request, res: express.Response ) => {
    const data = req.body;
    const user = await accountService.getAccount( data.email ) as LoginData;

    const pw = cryptoService.decrypt( Buffer.from( user.password as string, "hex" ) );

    if( user && data.password === pw ) {
      console.log( user );
      return res.status( 200 ).json( user.user );
    }

    return res.sendStatus( 401 );
  }

  const verify = async( req: express.Request, res: express.Response ) => {
    const emailToken = req.params.email;

    // email token should be encrypted to make it harder to spoof
    const email = cryptoService.decrypt( Buffer.from( emailToken, "hex" ) );

    const user = await accountService.getAccount( email ) as LoginData;

    if( user ) {
      user.verified = true;
      accountService.updateAccount( user );

      return res.sendStatus( 200 );
    }

    return res.sendStatus( 404 );
  }

  const update = async( req: express.Request, res: express.Response ) => {
    // TODO - finish this feature
  }

  const register = async( req: express.Request, res: express.Response ) => {
    const user = req.body;

    if( !user.email || user.email.length <= 0 ) {
      return res.sendStatus( 400 );
    }

    // default the status flags
    user.verified = false;
    user.active = false;

    // encrypt email
    try{
      const emailToken = cryptoService.encrypt( user.email );
    
      // encrypt password
      if( user.password && user.password.length > 0 ) {
        user.password = cryptoService.encrypt( user.password );
      }

      accountService.addAccount( user )
      .then( ( doc ) => {
        res.status( 200 ).json( {id:doc._id.toString(),verifyToken:emailToken} );
      } )
      .catch( ( error ) => {
        console.log( error );
        res.sendStatus( 400 );
      } );
    }
    catch( ex ){
      console.log( ex );
    }

    return;
  }

  return {
    signin,
    verify,
    update,
    register,
  }
}

export const accountController = createAccountController();