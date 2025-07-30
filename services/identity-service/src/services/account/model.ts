import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema(
	{
		email: { type: String, required: true },
		password: { type: String, required: true },
		verified: { type: Boolean, required: true },
		active: { type: Boolean, required: true },
		user: {
			firstName: { type: String, required: false },
			lastName: { type: String, required: false },
			lastLogin: { type: String, required: false },
			lastIpAddress: { type: String, required: false },
			roles: [],
		},
	},
	{ collection: 'adminUsers' },
);

export const accountModel = mongoose.model('adminUsers', accountSchema);
