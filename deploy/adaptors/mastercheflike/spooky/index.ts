import { BigNumberish, ContractTransaction, ethers } from "ethers";
import { SpookyMasterChef, SpookyMasterChef__factory } from "../../../../typechain";
import { IMasterChefLike } from "../IMasterChefLike";

export class SpookyMasterChefAdaptor implements IMasterChefLike {
  private _spookyMasterChef: SpookyMasterChef;

  constructor(spookyMasterChefAddress: string, signer: ethers.Signer) {
    this._spookyMasterChef = SpookyMasterChef__factory.connect(spookyMasterChefAddress, signer);
  }

  public async addPool(allocPoint: BigNumberish, tokenAddress: string): Promise<ContractTransaction> {
    return await this._spookyMasterChef.add(allocPoint, tokenAddress);
  }
}
