import { BigNumberish, ContractTransaction, ethers } from "ethers";
import { TShareRewardPool, TShareRewardPool__factory } from "../../../../typechain";
import { IMasterChefLike } from "../IMasterChefLike";

export class TombMasterChefAdaptor implements IMasterChefLike {
  private _tombMasterChef: TShareRewardPool;

  constructor(tombMasterChefAddress: string, signer: ethers.Signer) {
    this._tombMasterChef = TShareRewardPool__factory.connect(tombMasterChefAddress, signer);
  }

  public async addPool(allocPoint: BigNumberish, tokenAddress: string): Promise<ContractTransaction> {
    return await this._tombMasterChef.add(allocPoint, tokenAddress, true, 0);
  }
}
