export const safeJsonParse = (data: string) => {
  try {
    return JSON.parse(data);
  } catch (e) {
    return undefined;
  }
};

export const fetchJson = async (url: string, options: RequestInit) => {
  let data;
  let status;
  let error = '';

  try {
    const resp = await fetch(url, options);
    status = resp.status;

    if (resp.ok) {
      data = await resp.json();
    } else {
      data = await resp.text();
      error = resp.statusText;
    }
  } catch (e: unknown) {
    error = (e as Error).message;
    status = -1;
    data = null;
  }

  return { status, data, error };
};

export type RequestRetryInit = RequestInit & { maxRetries: number };

export const fetchWithRetries = async (
  url: string,
  options: RequestRetryInit,
  retryCount: number = 0,
): Promise<Response> => {
  const { maxRetries = 3, ...remainingOptions } = options;
  try {
    return await fetch(url, remainingOptions);
  } catch (error) {
    if (retryCount < maxRetries) {
      return fetchWithRetries(url, options, retryCount + 1);
    }
    throw error;
  }
};
