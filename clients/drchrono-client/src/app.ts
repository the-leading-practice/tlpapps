import express from 'express';
import { dbConnector } from 'services/mongodb';
import { createDrChronoClient } from 'drChronoClient';
import { drChronoAuth } from 'services/auth';
import { drChronoConfigService } from 'services/drChronoConfig/drChronoConfig';
import { webhookHandler } from 'services/webhookHandler';
import { DRCHRONO_API, PORT, OAUTH_REDIRECT_URI } from 'lib/constants';
import { DrChronoWebhookPayload } from 'types';

// mongodb
dbConnector.connect();

// start polling client after mongo connects
setTimeout( async () => {
  const client = createDrChronoClient();
  await client.init();
}, 3000 );

const app = express();
app.use( express.json() );

// ---------------------------------------------------------------------------
// Webhooks — DrChrono pushes real-time appointment and patient events here
// ---------------------------------------------------------------------------

/**
 * POST /webhook/drchrono
 *
 * Set this URL in the DrChrono webhook dashboard:
 *   https://tlpapps.theleadingpractice.com:9101/webhook/drchrono
 *
 * Subscribe to: APPOINTMENT_CREATE, APPOINTMENT_MODIFY, APPOINTMENT_DELETE,
 *               PATIENT_CREATE, PATIENT_MODIFY
 */
app.post( '/webhook/drchrono', async ( req, res ) => {
  const payload = req.body as DrChronoWebhookPayload;

  if( !payload?.action || !payload?.doctor ) {
    res.status( 400 ).send( 'invalid payload' );
    return;
  }

  console.log( `webhook received: ${payload.action} for doctor ${payload.doctor}` );

  const statusCode = await webhookHandler.handleEvent( payload );
  res.status( statusCode ).send();
} );

// ---------------------------------------------------------------------------
// OAuth flow — one-time setup per clinic location
// ---------------------------------------------------------------------------

/**
 * GET /oauth/authorize?location=ClinicName
 *
 * Redirects to DrChrono's consent screen.
 * The redirect_uri registered in the DrChrono OAuth app must match OAUTH_REDIRECT_URI.
 */
app.get( '/oauth/authorize', async ( req, res ) => {
  const locationName = req.query.location as string;
  if( !locationName ) {
    res.status( 400 ).send( 'missing ?location= query param' );
    return;
  }

  const config = await drChronoConfigService.getConfig();
  if( !config ) {
    res.status( 500 ).send( 'no config in database' );
    return;
  }

  const authUrl =
    `${DRCHRONO_API}/o/authorize/?response_type=code` +
    `&client_id=${encodeURIComponent( config.clientId )}` +
    `&redirect_uri=${encodeURIComponent( OAUTH_REDIRECT_URI )}` +
    `&state=${encodeURIComponent( locationName )}`;

  res.redirect( authUrl );
} );

/**
 * GET /oauth/callback?code=...&state=ClinicName
 *
 * DrChrono redirects here after the clinic grants access.
 * Exchanges the code for tokens and stores them in MongoDB.
 */
app.get( '/oauth/callback', async ( req, res ) => {
  const code = req.query.code as string;
  const locationName = req.query.state as string;

  if( !code || !locationName ) {
    res.status( 400 ).send( 'missing code or state' );
    return;
  }

  const config = await drChronoConfigService.getConfig();
  if( !config ) {
    res.status( 500 ).send( 'no config in database' );
    return;
  }

  const tokenResp = await drChronoAuth.exchangeCode(
    code,
    config.clientId,
    config.clientSecret,
    OAUTH_REDIRECT_URI
  );

  if( tokenResp.status >= 200 && tokenResp.status < 300 ) {
    const tokenData = tokenResp.data as any;
    const expiry = Date.now() + tokenData.expires_in * 1000;

    await drChronoConfigService.updateLocationTokens(
      locationName,
      tokenData.access_token,
      tokenData.refresh_token,
      expiry
    );

    res.send( `OAuth complete for "${locationName}". Tokens stored. You can close this window.` );
  } else {
    res.status( 500 ).send( `Token exchange failed: ${tokenResp.data}` );
  }
} );

app.listen( PORT, () => {
  console.log( `drchrono-client listening on port ${PORT}` );
} );
