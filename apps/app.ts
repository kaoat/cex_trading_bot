import Identity from "./Identity.js";
import Api from "./Api.js";
import { IConfig, ICandlesticksResponse, ITargetRatio } from "./Interfaces";
import { EMACalc, SMACalc, trendFinder } from "./indicators.js";
import { AxiosResponse } from "axios";
import fs from "fs";
import { json } from "stream/consumers";

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
  BTC: 50,
  USDT: 50,
};
const BTC_MINIMUM_TRADING = 10000 * Math.pow(10, -8);
const BTCUSDT_MINIMUM_DIFF_RATIO = 1;
const TEN_MINUTES = 1000 * 60 * 10;

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
  }, TEN_MINUTES);
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
async function log(
  date: Date,
  operationType: "BUY" | "SELL",
  quantityInDollar: number
) {
  let fileName: string = `${new Date().getDate()}-${
    new Date().getMonth() + 1
  }-${new Date().getFullYear()}.csv`;
  let dirname = "/tradingLogs";

  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname);
  }
  if (!fs.existsSync(`${dirname}/${fileName}`)) {
    fs.writeFileSync(
      `${dirname}/${fileName}`,
      "date,operationType, price,\r\n"
    );
  }
  fs.appendFileSync(
    `${dirname}/${fileName}`,
    `${date},${operationType},${quantityInDollar},\r\n`
  );
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
  if (trend == "UP") {
    console.log(
      `${new Date()}: Current BTCUSDT Diff Ratio: ${ratioDiff.toPrecision(
        2
      )} % | Minimum Diff Target Ratio: +-${BTCUSDT_MINIMUM_DIFF_RATIO} %`
    );
    if (Math.abs(ratioDiff) > BTCUSDT_MINIMUM_DIFF_RATIO) {
      if (ratioDiff > 0) {
        let sellQuantity = availableBtcBalance * (ratioDiff / 100);
        console.log(
          `${new Date()}: Sell BTC Quantity Condition: ${
            sellQuantity > BTC_MINIMUM_TRADING
          } | Available BTC Balance Condition: ${availableBtcBalance > 0}`
        );
        if (sellQuantity > BTC_MINIMUM_TRADING && availableBtcBalance > 0) {
          makeMarketOrder(MARKET, sellQuantity, "SELL", "MARKET")
            .then((res) => {
              console.log(
                `${new Date()}: SELL btc in ${
                  sellQuantity * currentBtcUsdtPrice
                } dollar.`
              );
              log(new Date(), "SELL", sellQuantity * currentBtcUsdtPrice);
            })
            .catch((err) => {
              console.log(
                `${new Date()}: ERROR: ${
                  err.response.data.error.message
                } | CODE: ${err.response.data.error.status}`
              );
            });
        }
      } else {
        let buyQuantity = availableBtcBalance * (Math.abs(ratioDiff) / 100);
        console.log(
          `${new Date()}: Buy BTC Quantity Condition: ${
            buyQuantity > BTC_MINIMUM_TRADING
          } | Available USDT Balance Condition: ${availableBtcBalance > 0}`
        );
        if (buyQuantity > BTC_MINIMUM_TRADING && availableUsdtBalance > 0) {
          makeMarketOrder(MARKET, buyQuantity, "BUY", "MARKET")
            .then((res) => {
              console.log(
                `${new Date()}: BUY btc in ${
                  buyQuantity * currentBtcUsdtPrice
                } dollar.`
              );
              log(new Date(), "BUY", buyQuantity * currentBtcUsdtPrice);
            })
            .catch((err) => {
              console.log(
                `${new Date()}: ERROR: ${
                  err.response.data.error.message
                } | CODE: ${err.response.data.error.status}`
              );
            });
        }
      }
    }
  } else {
    console.log(
      `${new Date()}: All BTC Sell Quantity Condition: ${
        availableBtcBalance > BTC_MINIMUM_TRADING
      }`
    );
    if (availableBtcBalance > BTC_MINIMUM_TRADING) {
      makeMarketOrder(MARKET, availableBtcBalance, "SELL", "MARKET")
        .then((res) => {
          console.log(
            `${new Date()}: SELL btc in ${
              availableBtcBalance * currentBtcUsdtPrice
            } dollar.`
          );
          log(new Date(), "SELL", availableBtcBalance * currentBtcUsdtPrice);
        })
        .catch((err) => {
          console.log(
            `${new Date()}: ERROR: ${err.response.data.error.message} | CODE: ${
              err.response.data.error.status
            }`
          );
        });
    }
  }
}
app();
