import mongoose from 'mongoose';

const appConfigSchema = new mongoose.Schema(
	{
		location: { type: String, required: true },
		config: {
			LastRun: { type: String, required: true },
			DBProvider: { type: String, required: true },
			UseCacheTable: { type: Boolean, required: true },
			TokenRefreshMilliseconds: { type: Number, required: true },
			AuthEndpoint: { type: String, required: true },
			NotificationEndpoint: { type: String, required: true },
			PatientEndpoint: { type: String, required: true },
			AppointmentEndpoint: { type: String, required: true },
			ConnectionString: { type: String, required: true },
			RepeatMilliseconds: { type: Number, required: true },
			MaxBatchSize: { type: Number, required: true },
			Software: { type: String, required: false },
			Tables: [
				{
					Name: { type: String, required: true },
					UniqueField: { type: String, required: true },
					formattedQuery: { type: String, required: false },
					SqlQuery: { type: String, required: true },
					Endpoint: { type: String, required: false },
				},
			],
		},
	},
	{ collection: 'clientAppConfigs' },
);

export const appConfigModel = mongoose.model('clientAppConfigs', appConfigSchema);
