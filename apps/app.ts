import Identity from "./Identity.js";
import Api from "./Api.js";
import { IConfig, ICandlesticksResponse, ITargetRatio } from "./Interfaces";
import { EMACalc, SMACalc, trendFinder } from "./indicators.js";
import { AxiosResponse } from "axios";

const conf: IConfig = {
  apiHost: Identity.apiHost,
  apiKey: Identity.apiKey,
  apiSecret: Identity.apiSecret,
  orgId: Identity.orgId,
  localTimeDiff: null,
  locale: "en",
};
const UNIX_TIME_IN_1_DAY: number = 86400;
const RESOLUTION: number = 1440;
const MARKET: "BTCUSDT" = "BTCUSDT";
const COUNT_BACK: number = 40;
const BTC_USDT_RATIO: ITargetRatio = {
  BTC: 60,
  USDT: 40,
};
const BTC_MINIMUM_TRADING = 15000 * Math.pow(10, -8);

const api = new Api(conf);

async function app() {
  let candleSticksArray: ICandlesticksResponse[] = await getCandleSticks();
  let closePrice: number[] = getClosePrice(candleSticksArray);
  let priceIndicator12: number[] = SMACalc(closePrice, 12);
  let priceIndicator26: number[] = SMACalc(closePrice, 26);
  let currentTrend: "UP" | "DOWN" = trendFinder(
    priceIndicator12,
    priceIndicator26
  );
  let currentBtcUsdtPrice: number = await getCurrentPrice(MARKET);
  let availableBtcBalance: number = await getAvailableBalance("BTC");
  let availableUsdtBalance: number = await getAvailableBalance("USDT");
  rebalancing(
    currentTrend,
    currentBtcUsdtPrice,
    availableBtcBalance,
    availableUsdtBalance,
    BTC_USDT_RATIO
  );
  setTimeout(function () {
    app();
  }, 60000);
}

async function getCurrentPrice(market: string) {
  //https://api2.nicehash.com/exchange/api/v2/info/prices
  var allPricesResponse: AxiosResponse<any> = await api.get(
    "/exchange/api/v2/info/prices",
    {}
  );
  return allPricesResponse.data[market];
}

async function getCandleSticks() {
  var unixEndTime: number = Math.round(new Date().getTime() / 1000);
  var unixStartTime: number = unixEndTime - UNIX_TIME_IN_1_DAY * COUNT_BACK;

  var candleSticksParam = {
    query: {
      countBack: COUNT_BACK,
      from: unixStartTime,
      to: unixEndTime,
      market: MARKET,
      resolution: RESOLUTION,
    },
  };
  var candleStickResponse: AxiosResponse<Array<ICandlesticksResponse>> =
    await api.get("/exchange/api/v2/info/candlesticks", candleSticksParam);
  return candleStickResponse.data;
}

async function getAvailableBalance(currency: "BTC" | "USDT"): Promise<number> {
  var getBalanceParam = {
    query: {
      extendedResponse: false,
    },
  };
  let getBalanceResponse: AxiosResponse<any> = await api.get(
    `/main/api/v2/accounting/account2/${currency}`,
    getBalanceParam
  );
  return getBalanceResponse.data.available * 1;
}

function getClosePrice(inputData: Array<ICandlesticksResponse>): Array<number> {
  let returnData: Array<number> = new Array<number>();

  for (let value of inputData) {
    returnData.push(value.close);
  }
  return returnData;
}

function makeMarketOrder(
  market: "BTCUSDT",
  quantity: number,
  side: "BUY" | "SELL",
  type: "MARKET"
): Promise<AxiosResponse<any>> {
  return api.post("/exchange/api/v2/order", {
    query: {
      market: market,
      side: side,
      type: type,
      quantity: quantity,
    },
  });
}

function getOpenPrice(inputData: ICandlesticksResponse[]): number[] {
  let returnData: Array<number> = new Array<number>();
  for (let value of inputData) {
    returnData.push(value.open);
  }
  return returnData;
}

async function rebalancing(
  trend: "UP" | "DOWN",
  currentBtcUsdtPrice: number,
  availableBtcBalance: number,
  availableUsdtBalance: number,
  btcUsdtRatio: ITargetRatio
) {
  let availableBtcInDollar: number = currentBtcUsdtPrice * availableBtcBalance;
  let totalAvailableBalanceInDollar: number =
    availableUsdtBalance + availableBtcInDollar;
  let currentBtcRatio: number =
    (availableBtcInDollar / totalAvailableBalanceInDollar) * 100;
  let ratioDiff: number = currentBtcRatio - btcUsdtRatio.BTC;
  let response: AxiosResponse<any>;
  if (trend == "UP") {
    if (ratioDiff > 0) {
      let sellQuantity = availableBtcBalance * (ratioDiff / 100);
      if (sellQuantity > BTC_MINIMUM_TRADING && availableBtcBalance > 0) {
        response = await makeMarketOrder(
          MARKET,
          sellQuantity,
          "SELL",
          "MARKET"
        );
        if (response.status == 200) {
          console.log(`${response.data.state}: ${sellQuantity} ${new Date()}`);
        }
      }
    } else {
      let buyQuantity = availableBtcBalance * (Math.abs(ratioDiff) / 100);
      if (buyQuantity > BTC_MINIMUM_TRADING && availableUsdtBalance > 0) {
        response = await makeMarketOrder(MARKET, buyQuantity, "BUY", "MARKET");
        if (response.status == 200) {
          console.log(`${response.data.state}: ${buyQuantity} ${new Date()}`);
        }
      }
    }
  } else {
    if (availableBtcBalance > BTC_MINIMUM_TRADING) {
      response = await makeMarketOrder(
        MARKET,
        availableBtcBalance,
        "SELL",
        "MARKET"
      );
      if (response.status == 200) {
        console.log(
          `${response.data.state}: ${availableBtcBalance} ${new Date()}`
        );
      }
    }
  }
}

app();
