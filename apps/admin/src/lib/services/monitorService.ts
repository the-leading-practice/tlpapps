const MONITOR_URL = "http://localhost:5680/monitor";

const createMonitorService = () => {

	const getContainers = async () => {
		const options = {
			method: 'GET'
		}

		const resp = await fetch( `${MONITOR_URL}/list`, options );
		const json = await resp.json();

		return json;
	}

	const getStats = async ( id: string ) => {
		const options = {
			method: 'GET'
		}

		const resp = await fetch( `${MONITOR_URL}/stats/${id}`, options );
		const json = await resp.json();

		return json;
	}

	return {
		getContainers,
		getStats
	}
}

export const monitorService = createMonitorService();