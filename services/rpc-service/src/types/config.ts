export type Config = {
  service: Service;
}

export type Service = {
  name: string;
  port: number;
  wsPort: number;
  pingInterval: number;
}