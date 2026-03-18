import mongoose from 'mongoose';

const silkOneConfigSchema = new mongoose.Schema(
  {
    config: {
      type: {
        RepeatMilliseconds: { type: Number, required: true },
        TokenRefreshMilliseconds: { type: Number, required: true },
        MaxBatchSize: { type: Number, required: true },
      },
      required: true,
    },
    locations: [
      {
        location: { type: String, required: true },
        clientId: { type: String, required: true },
        secret: { type: String, required: true },
      },
    ],
  },
  { collection: 'silkOneConfig' },
);

export const SilkOneConfigModel = mongoose.model('silkOneConfig', silkOneConfigSchema);
