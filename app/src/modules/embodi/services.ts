import registry from './registry.js';
import { logger } from '../../logger.js';
import type { EmbodiLocationSetting, EmbodiNotificationMessage } from './types.js';

const EMBODI_AUTH_URL = process.env.EMBODI_AUTH_URL || 'https://staging-auth.kaizenovate.net';
const EMBODI_API_URL = process.env.EMBODI_API_URL || 'https://staging.portal.embodihealth.com';

const TLP_API_URL = 'https://tlpapps.theleadingpractice.com/api/';

// ---------------------------------------------------------------------------
// Embodi API Client
// ---------------------------------------------------------------------------

const createEmbodiService = () => {
  const commonHeaders = {
    'Content-Type': 'application/json',
  };

  const login = async (user: string, pass: string) => {
    const endpoint = `${EMBODI_AUTH_URL}/users/login`;
    logger.info(`logging into embodi ${endpoint}`);

    const auth = {
      username: user,
      password: pass,
    };

    const options = {
      method: 'POST',
      headers: { ...commonHeaders },
      body: JSON.stringify(auth),
    };

    let json: any = undefined;
    try {
      const res = await fetch(endpoint, options);

      if (!res.ok) {
        const text = await res.text();
        logger.error(`embodi login error: ${res.status} ${text}`);
        return undefined;
      }

      json = await res.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error(`embodi login syntax error: ${error}`);
      } else {
        logger.error(`embodi login error: ${error}`);
      }
      return undefined;
    }

    if (json && json.success === true) {
      const embodi = {
        ...json,
        lastRefresh: new Date().getTime(),
      };
      registry.set('embodiAuth', embodi);
      return embodi;
    }
  };

  const checkAvailability = async (start: number, end: number, id: string) => {
    const endpoint = `${EMBODI_API_URL}/ghl/appointment/get-availabilities`;
    const query = `?location_id=${id}&start_time=${start}&end_time=${end}`;

    logger.info(`requesting availabilities ${endpoint}${query}`);

    const auth = registry.get('embodiAuth');
    if (!auth || auth.token.length === 0) {
      logger.error('no valid login with embodi returning');
      return undefined;
    }

    const options = {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + auth.token,
        ...commonHeaders,
      },
    };

    let json: any = undefined;
    try {
      const res = await fetch(`${endpoint}${query}`, options);

      if (!res.ok) {
        const text = await res.text();
        logger.error(`embodi availability error: ${res.status} ${text}`);
        return undefined;
      }

      json = await res.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error(`embodi availability syntax error: ${error}`);
      } else {
        logger.error(`embodi availability error: ${error}`);
      }
    }

    if (json) return json;
    return undefined;
  };

  const scheduleAppointment = async (start: number, end: number, id: string) => {
    const endpoint = `${EMBODI_API_URL}/ghl/appointment/create`;
    const query = `?contact_id=${id}&start_time=${start}&end_time=${end}`;

    const auth = registry.get('embodiAuth');
    if (!auth || auth.token.length === 0) {
      logger.error('no valid login with embodi returning');
      return undefined;
    }

    const options = {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + auth.token,
        ...commonHeaders,
      },
    };

    let json: any = undefined;
    let res;
    try {
      res = await fetch(`${endpoint}${query}`, options);

      if (!res.ok) {
        const text = await res.text();
        logger.error(`embodi schedule error: ${res.status} ${text}`);
        return undefined;
      }

      json = await res.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error(`embodi schedule syntax error: ${error}`);
      } else {
        logger.error(`embodi schedule error: ${error}`);
      }
    }

    if (json) return { status: res?.status, data: json };
    return undefined;
  };

  return {
    login,
    checkAvailability,
    scheduleAppointment,
  };
};

export const embodiService = createEmbodiService();

// ---------------------------------------------------------------------------
// TLP API Service (used by embodi sync for GHL calendar operations)
// ---------------------------------------------------------------------------

const createTLPService = () => {
  const login = async (location: string, secret: string) => {
    const auth = { location, secret };

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auth),
    };

    const resp = await fetch(`${TLP_API_URL}auth`, options);

    if (resp.ok) {
      const json = await resp.json();
      return json;
    }

    return undefined;
  };

  const addBlock = async (start: Date, end: Date, location: EmbodiLocationSetting) => {
    const blockData = {
      start: start.toISOString(),
      end: end.toISOString(),
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${location.token}`,
      },
      body: JSON.stringify(blockData),
    };

    const resp = await fetch(`${TLP_API_URL}ghl/calendar/block`, options);
    const json = await resp.json();
    return { status: resp.status, data: json };
  };

  const getBlock = async (start: Date, end: Date, location: EmbodiLocationSetting) => {
    const query = `?startTime=${start.getTime()}&endTime=${end.getTime()}`;

    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${location.token}`,
      },
    };

    const resp = await fetch(`${TLP_API_URL}ghl/calendar/block${query}`, options);
    const text = await resp.text();
    return { status: resp.status, data: text };
  };

  const deleteBlock = async (eventId: string, location: EmbodiLocationSetting) => {
    const query = `?eventId=${eventId}`;

    const options = {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${location.token}`,
      },
    };

    const resp = await fetch(`${TLP_API_URL}ghl/calendar/block${query}`, options);
    const text = await resp.text();
    return { status: resp.status, data: text };
  };

  const postNotification = async (
    msg: EmbodiNotificationMessage,
    location: EmbodiLocationSetting,
  ) => {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${location.token}`,
      },
      body: JSON.stringify(msg),
    };

    const resp = await fetch(`${TLP_API_URL}notification`, options);
    const text = await resp.text();
    return { status: resp.status, data: text };
  };

  return {
    login,
    addBlock,
    getBlock,
    deleteBlock,
    postNotification,
  };
};

export const tlpService = createTLPService();
