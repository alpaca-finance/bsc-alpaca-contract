import { BigNumberish, ContractTransaction, ethers } from "ethers";
import { BSCPool, BSCPool__factory } from "../../../../typechain";
import { IMasterChefLike } from "../IMasterChefLike";

export class MdexMasterChefAdaptor implements IMasterChefLike {
  private _mdexMasterChef: BSCPool;

  constructor(mdexMasterChefAddress: string, signer: ethers.Signer) {
    this._mdexMasterChef = BSCPool__factory.connect(mdexMasterChefAddress, signer);
  }

  public async addPool(allocPoint: BigNumberish, tokenAddress: string): Promise<ContractTransaction> {
    return await this._mdexMasterChef.add(allocPoint, tokenAddress, true);
  }
}
