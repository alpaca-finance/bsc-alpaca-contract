import { BigNumberish, ContractTransaction } from "ethers";

export interface IMasterChefLike {
  addPool(allocPoint: BigNumberish, tokenAddress: string): Promise<ContractTransaction>;
}
