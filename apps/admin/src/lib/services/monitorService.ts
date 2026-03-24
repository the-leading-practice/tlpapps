import { apiGet } from "$lib/api";

const createMonitorService = () => {

	const getContainers = async () => {
		return apiGet('/monitor/list');
	}

	const getStats = async (id: string) => {
		return apiGet(`/monitor/stats/${id}`);
	}

	return {
		getContainers,
		getStats
	}
}

export const monitorService = createMonitorService();
