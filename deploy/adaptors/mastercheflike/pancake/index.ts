import { BigNumberish, ContractTransaction, ethers } from "ethers";
import { PancakeMasterChef, PancakeMasterChef__factory } from "../../../../typechain";
import { IMasterChefLike } from "../IMasterChefLike";

export class PancakeMasterChefAdaptor implements IMasterChefLike {
  private _pancakeMasterChef: PancakeMasterChef;

  constructor(pancakeMasterChefAddress: string, signer: ethers.Signer) {
    this._pancakeMasterChef = PancakeMasterChef__factory.connect(pancakeMasterChefAddress, signer);
  }

  public async addPool(allocPoint: BigNumberish, tokenAddress: string): Promise<ContractTransaction> {
    return await this._pancakeMasterChef.add(allocPoint, tokenAddress, true);
  }
}
