import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakeswapV2Worker02,
  PancakeswapV2Worker02__factory,
} from "../../typechain";

export class Worker02Helper {
  private worker: PancakeswapV2Worker02;
  private masterChef: PancakeMasterChef;

  constructor(_workerAddress: string, _masterChefAddress: string) {
    this.worker = PancakeswapV2Worker02__factory.connect(_workerAddress, ethers.provider);
    this.masterChef = PancakeMasterChef__factory.connect(_masterChefAddress, ethers.provider);
  }

  public computeShareToBalance(share: BigNumber, totalShare: BigNumber, totalBalance: BigNumber): BigNumber {
    if (totalShare.eq(0)) return share;
    return share.mul(totalBalance).div(totalShare);
  }

  public computeBalanceToShare(balance: BigNumber, totalShare: BigNumber, totalBalance: BigNumber): BigNumber {
    if (totalShare.eq(0)) return balance;
    return balance.mul(totalShare).div(totalBalance);
  }
}
