import { BigNumber } from "ethers";

export interface IGasPriceService {
  getFastGasPrice(): Promise<BigNumber>;
}
