import Api from "./Api.js";
import { IConfig, ICandlesticksResponse } from "./Interfaces";
import { SMACalc, trendFinder } from "./indicators.js";
import { AxiosResponse } from "axios";
import fs from "fs";
import { type } from "os";
import { Console } from "console";

const UNIX_TIME_IN_1_DAY: number = 86400;
const SETTING = JSON.parse(fs.readFileSync("./bot_config.json", "utf-8"));
const API_CONFIG: IConfig = {
  apiHost: SETTING.account.API_HOST,
  apiKey: SETTING.account.API_KEY,
  apiSecret: SETTING.account.API_SECRET,
  localTimeDiff: null,
  locale: "en",
  orgId: SETTING.account.ORG_ID,
};
const API = new Api(API_CONFIG);
const MINUTES = 1000 * 60 * SETTING.botSetting.BOT_INTERVAL_TIME_MINUTES;

async function app() {
  try {
    let timeTo: number = Math.round(new Date().getTime() / 1000);
    let timeFrom: number =
      timeTo - UNIX_TIME_IN_1_DAY * SETTING.botSetting.CANDLESTICKS_COUNT_BACK;
    let candleSticksArray: ICandlesticksResponse[] = await getCandleSticks(
      SETTING.orderSetting.TOKEN1.toUpperCase() +
        SETTING.orderSetting.TOKEN2.toUpperCase(),
      timeFrom,
      timeTo,
      SETTING.botSetting.CANDLESTICKS_COUNT_BACK,
      SETTING.botSetting.GRAPH_INTERVAL_TIME_MINUTES
    );
    let closedPrice: number[] = getClosedPrice(candleSticksArray);
    let shortIndicator: number[] = SMACalc(
      closedPrice,
      SETTING.indicator.SHORT
    );
    let longIndicator: number[] = SMACalc(closedPrice, SETTING.indicator.LONG);
    let trend: "UP" | "DOWN" = trendFinder(shortIndicator, longIndicator);
    let token1Price: number = await getCurrentPrice(
      SETTING.orderSetting.TOKEN1.toUpperCase() +
        SETTING.orderSetting.TOKEN2.toUpperCase()
    );
    let token1AvailableBalance: number = await getAvailableBalance(
      SETTING.orderSetting.TOKEN1.toUpperCase()
    );
    let token2AvailableBalance: number = await getAvailableBalance(
      SETTING.orderSetting.TOKEN2.toUpperCase()
    );
    let today: Date = new Date();
    let todayString: string = `${today.getUTCDate()}-${
      today.getUTCMonth() + 1
    }-${today.getUTCFullYear()} ${today.getUTCHours}:${today.getUTCMinutes}`;
    console.log(
      `${todayString}: Trend: ${trend} | Price: ${token1Price} ${SETTING.orderSetting.TOKEN2.toUpperCase()}`
    );
    if (trend == "UP") {
      rebalancing(
        SETTING.orderSetting.TOKEN1.toUpperCase(),
        SETTING.orderSetting.TOKEN2.toUpperCase(),
        token1Price,
        token1AvailableBalance,
        token2AvailableBalance,
        SETTING.botSetting.TOKEN1_PERCENT_IN_PORT,
        SETTING.botSetting.MINIMUM_PERCENT_DIFF,
        SETTING.orderSetting.TOKEN1_MINIMUM_AMOUNT_PER_ORDER,
        SETTING.orderSetting.TOKEN2_MINIMUM_AMOUNT_PER_ORDER
      );
    } else if (trend == "DOWN") {
      if (
        token1AvailableBalance >
        SETTING.orderSetting.TOKEN1_MINIMUM_AMOUNT_PER_ORDER
      ) {
        makeMarketOrder(
          SETTING.orderSetting.TOKEN1.toUpperCase() +
            SETTING.orderSetting.TOKEN2.toUpperCase(),
          "SELL",
          token1AvailableBalance
        )
          .then((res) => {
            console.log(
              `${todayString}: SELL ${token1AvailableBalance} ${SETTING.orderSetting.TOKEN1.toUpperCase()} for ${
                token1AvailableBalance * token1Price
              } ${SETTING.orderSetting.TOKEN2.toUpperCase()}`
            );
            log(
              today,
              SETTING.orderSetting.TOKEN1.toUpperCase() +
                SETTING.orderSetting.TOKEN2.toUpperCase(),
              "SELL",
              token1AvailableBalance,
              token1Price,
              token1AvailableBalance * token1Price + token2AvailableBalance
            );
          })
          .catch((err) => {
            console.log(
              `${todayString}: error ${err.response.data.error.message} | code ${err.response.data.error.status}`
            );
          });
      } else {
        console.log(
          `${todayString}: Condition: ${
            token1AvailableBalance >
            SETTING.orderSetting.TOKEN1_MINIMUM_AMOUNT_PER_ORDER
          } | Available: ${token1AvailableBalance} | Minimum: ${
            SETTING.orderSetting.TOKEN1_MINIMUM_AMOUNT_PER_ORDER
          }`
        );
      }
    }
  } catch (error) {
    console.log(error);
  } finally {
    setInterval(app, MINUTES);
  }
}

async function getCurrentPrice(market: string) {
  var allPricesResponse: AxiosResponse<any> = await API.get(
    "/exchange/api/v2/info/prices",
    {}
  );
  return allPricesResponse.data[market];
}

async function getCandleSticks(
  market: string,
  timeFrom: number,
  timeTo: number,
  countBack: number,
  timeInterval: number
) {
  var candleSticksParam = {
    query: {
      countBack: countBack,
      from: timeFrom,
      to: timeTo,
      market: market,
      resolution: timeInterval,
    },
  };
  var candleStickResponse: AxiosResponse<ICandlesticksResponse[]> =
    await API.get("/exchange/api/v2/info/candlesticks", candleSticksParam);
  return candleStickResponse.data;
}

async function getAvailableBalance(currency: string): Promise<number> {
  let queryParam = {
    query: {
      extendedResponse: false,
    },
  };
  let getBalanceResponse: AxiosResponse<any> = await API.get(
    `/main/api/v2/accounting/account2/${currency}`,
    queryParam
  );
  return parseFloat(getBalanceResponse.data.available);
}

function getClosedPrice(inputData: ICandlesticksResponse[]): number[] {
  let returnData: number[] = new Array<number>();

  for (let value of inputData) {
    returnData.push(value.close);
  }
  return returnData;
}

function makeMarketOrder(
  market: string,
  side: "BUY" | "SELL",
  quantity: number
): Promise<AxiosResponse<any>> {
  let queryParam: any = {
    query: {
      market: market,
      side: side,
      type: "MARKET",
    },
  };
  if (side == "BUY") {
    queryParam.query.secQuantity = quantity;
  } else if (side == "SELL") {
    queryParam.query.quantity = quantity;
  }
  return API.post("/exchange/api/v2/order", queryParam);
}

async function log(
  date: Date,
  market: string,
  orderType: "BUY" | "SELL",
  quantityInOrder: number,
  price: number,
  totalValueInToken2: number
) {
  let fileName: string = `${date.getDate()}-${
    date.getMonth() + 1
  }-${date.getFullYear()}.csv`;
  let dirname = "/tradingLogs";

  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname);
  }
  if (!fs.existsSync(`${dirname}/${fileName}`)) {
    fs.writeFileSync(
      `${dirname}/${fileName}`,
      "Date,Market,Order Type,Amount,Price, Total Value(Token1+Token2) in Token2 unit,\r\n"
    );
  }
  fs.appendFileSync(
    `${dirname}/${fileName}`,
    `${date},${market},${orderType},${quantityInOrder},${price},${totalValueInToken2},\r\n`
  );
}

async function rebalancing(
  token1Name: string,
  token2Name: string,
  token1Price: number,
  token1Balance: number,
  token2Balance: number,
  token1TargetPercentInPort: number,
  minimumPercentDiff: number,
  minimumToken1PerOrder: number,
  minimumToken2PerOrder: number
) {
  let token1BalanceInToken2Unit: number = token1Balance * token1Price;
  let totalBalanceInToken2Unit: number =
    token1BalanceInToken2Unit + token2Balance;
  let token1PercenInPort: number =
    (token1BalanceInToken2Unit / totalBalanceInToken2Unit) * 100 || 0;
  let diffPercent: number = token1PercenInPort - token1TargetPercentInPort;

  let today: Date = new Date();
  let todayString: string = `${today.getUTCDate()}-${
    today.getUTCMonth() + 1
  }-${today.getUTCFullYear()} ${today.getUTCHours}:${today.getUTCMinutes}`;

  if (Math.abs(diffPercent) > minimumPercentDiff) {
    let orderTypeToOrder: "SELL" | "BUY";
    let quantityToOrder: number;
    let minimumToMakeOrder: number;
    let newTotalValueInToken2Unit: number =
      token1Price * token1Balance + token2Balance;

    if (diffPercent > 0) {
      quantityToOrder = token1Balance * (diffPercent / 100);
      orderTypeToOrder = "SELL";
      minimumToMakeOrder = minimumToken1PerOrder;
    } else {
      quantityToOrder = token2Balance * (Math.abs(diffPercent) / 100);
      orderTypeToOrder = "BUY";
      minimumToMakeOrder = minimumToken2PerOrder;
    }
    if (quantityToOrder > minimumToMakeOrder) {
      makeMarketOrder(
        token1Name + token2Name,
        orderTypeToOrder,
        quantityToOrder
      )
        .then((res) => {
          console.log(
            `${todayString}: ${orderTypeToOrder} ${
              orderTypeToOrder == "BUY"
                ? (quantityToOrder / token1Price).toPrecision(4)
                : quantityToOrder
            } ${token1Name} for ${
              orderTypeToOrder == "BUY"
                ? quantityToOrder
                : quantityToOrder * token1Price
            } ${token2Name}`
          );
          log(
            today,
            token1Name + token2Name,
            orderTypeToOrder,
            quantityToOrder,
            token1Price,
            newTotalValueInToken2Unit
          );
        })
        .catch((err) => {
          console.log(
            `${todayString}: error ${err.response.data.error.message} | code ${err.response.data.error.status}`
          );
        });
    } else {
      console.log(
        `${todayString}: Condition:${
          quantityToOrder > minimumToMakeOrder
        } | Quantity: ${quantityToOrder} | minimum: ${minimumToMakeOrder}`
      );
    }
  } else {
    console.log(
      `${todayString}: Condition: ${
        Math.abs(diffPercent) > minimumPercentDiff
      } | Diff: ${diffPercent} | Minimum Diff: ${minimumPercentDiff}`
    );
  }
}

app();
