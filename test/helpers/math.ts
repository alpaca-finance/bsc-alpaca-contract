import { BigNumber } from "ethers";

export const sqrt = (value: BigNumber): BigNumber => {
  const ONE = BigNumber.from(1);
  const TWO = BigNumber.from(2);
  let z = value.add(ONE).div(TWO);
  let y = value;
  while (z.sub(y).isNegative()) {
    y = z;
    z = value.div(z).add(z).div(TWO);
  }
  return y;
};
