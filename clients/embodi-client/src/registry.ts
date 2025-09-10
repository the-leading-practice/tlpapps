import { Dictionary } from 'types/types.js';

// in memory writable store
const Registry = () => {
	const _data: Dictionary<any> = {};

	const get = (key: string): any => {
		if (_data[key]) {
			return _data[key];
		}

		return undefined;
	};

	const set = (key: string, value: any) => {
		_data[key] = value;
	};

	return {
		get,
		set,
	};
};

const registry = Registry();
export default registry;
