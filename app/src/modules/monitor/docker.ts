import * as http from 'http';
import * as fs from 'fs';

export type HTTPCallResponse = {
  response: http.IncomingMessage | null;
  data: string;
};

const requestSync = async (options: http.RequestOptions, postData?: any) => {
  return new Promise<HTTPCallResponse>((resolve, reject) => {
    let data = '';

    if ((options.socketPath && !fs.existsSync(options.socketPath)) || !options.socketPath) {
      reject(`no such socket ${options.socketPath}`);
    }

    const req = http.request(options, (res) => {
      res.on('data', (d) => {
        data += d;
      });

      res.on('end', () => {
        resolve({
          response: res,
          data: data,
        });
      });

      res.on('error', (error) => {
        reject(error);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (postData) {
      req.write(postData);
    }

    req.end();
  });
};

const createDockerService = () => {
  const unixSocket = '/var/run/docker.sock';

  const list = async () => {
    const options = {
      socketPath: unixSocket,
      method: 'GET',
      path: '/containers/json',
    };

    const resp = await requestSync(options);

    return {
      status: resp.response?.statusCode || 500,
      data: resp.data,
    };
  };

  const info = async () => {
    const options = {
      socketPath: unixSocket,
      method: 'GET',
      path: '/info',
    };

    const resp = await requestSync(options).catch((error) => {
      console.log(error);
      return {
        response: null,
        data: error,
      };
    });

    return {
      status: resp.response?.statusCode || 500,
      data: resp.data,
    };
  };

  const stats = async (id: string) => {
    const options = {
      socketPath: unixSocket,
      method: 'GET',
      path: `/containers/${id}/stats?stream=false&one-shot=true`,
    };

    const resp = await requestSync(options).catch((error) => {
      console.log(error);
      return {
        response: null,
        data: error,
      };
    });

    return {
      status: resp.response?.statusCode || 500,
      data: resp.data,
    };
  };

  return {
    list,
    info,
    stats,
  };
};

export const dockerService = createDockerService();
