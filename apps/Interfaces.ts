interface ICandlesticksResponse {
  time: number;
  open: number;
  close: number;
  low: number;
  high: number;
  volume: number;
  quote_volume: number;
  count: number;
}

interface IRequest {
  method: string;
  path: string;
  query: string;
  body: string;
}

interface IConfig {
  apiHost: string;
  apiKey: string;
  apiSecret: string;
  orgId: string;
  locale: string | "en";
  localTimeDiff: number | null;
}

interface ITargetRatio {
  BTC: number;
  USDT: number;
}

export { ICandlesticksResponse, IRequest, IConfig, ITargetRatio };
