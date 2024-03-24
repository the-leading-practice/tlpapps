import mongoose from "mongoose";

const patientSchema = new mongoose.Schema( {
  locationId: { type: String, required: true },
  patientId: { type: Number, required: true },
  contactId: { type: String, required: true }
}, {collection: 'patients'} );

export const Patient = mongoose.model( 'patients', patientSchema );