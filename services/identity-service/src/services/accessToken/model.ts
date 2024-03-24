import mongoose from 'mongoose';

const accessTokenSchema = new mongoose.Schema( {
  name: { type: String, required: true },
  location: { type: String, required: true },
  calendar: { type: String, required: true },
  timezone: { type: String, required: true },
  secret: { type: String, required: true },
  token: { type: String, required: false },
  pushGHL: { type: Boolean, required: false },
  pushAppt: { type: Boolean, required: false },
  pushPat: { type: Boolean, required: false },
  software: { type: String, required: true }
}, {collection: 'accessTokens'} );

export const accessTokenModel = mongoose.model( 'accessTokens', accessTokenSchema );