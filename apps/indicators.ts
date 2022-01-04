function sma(
  closingPriceArray: number[],
  mRange: number,
  startIndex: number
): number {
  let tempArray: number[] = closingPriceArray.filter(
    (value, index) => index >= startIndex && index < startIndex + mRange
  );
  let tempResult: number = tempArray.reduce(
    (accumulator, value) => accumulator + value
  );
  return tempResult / mRange;
}

function ema(currentPrice: number, emaPrevious: number, range: number): number {
  let multiplier = 2 / (range + 1);
  return currentPrice * multiplier + emaPrevious * (1 - multiplier);
}
function SMACalc(mArray: number[], mRange: number): number[] {
  var smaArray: number[] = new Array();
  let calculator: number = 0;
  for (let i = 0; i < mArray.length; i++) {
    calculator = sma(mArray, mRange, i);
    smaArray.push(calculator);
  }
  return smaArray;
}
function EMACalc(mArray: Array<number>, mRange: number): Array<number> {
  var emaArray: number[] = new Array();
  let calculator: number = 0;
  for (let i = 0; i < mArray.length; i++) {
    calculator = 0;
    if (i == 0) {
      //calculator = ema(mArray[i], mArray[i], mRange);
      calculator = ema(mArray[i], sma(mArray, mRange, i), mRange);
    } else {
      calculator = ema(mArray[i], emaArray[i - 1], mRange);
    }
    emaArray.push(calculator);
  }
  return emaArray;
}

function trendFinder(
  ema12: Array<number>,
  ema26: Array<number>
): "UP" | "DOWN" {
  for (let i = 1; i < ema12.length; i++) {
    if (ema12[i] == ema26[i]) {
      if (i + 1 < ema12.length) {
        if (ema12[i + 1] > ema26[i + 1]) {
          return "DOWN";
        } else {
          return "UP";
        }
      }
      return "DOWN";
    } else if (ema12[i] > ema26[i]) {
      return "UP";
    } else {
      return "DOWN";
    }
  }
  return "DOWN";
}

export { EMACalc, trendFinder, SMACalc };
