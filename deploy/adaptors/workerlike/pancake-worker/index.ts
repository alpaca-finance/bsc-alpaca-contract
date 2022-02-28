import { expect } from "chai";
import { ethers } from "ethers";
import { PancakeswapV2Worker02, PancakeswapV2Worker02__factory } from "../../../../typechain";
import { WorkersEntity } from "../../../interfaces/config";
import { IWorkerLike } from "../IWorkerLike";

export class PancakeWorkerAdaptor implements IWorkerLike {
  private _worker: PancakeswapV2Worker02;

  constructor(_workerAddress: string, _signerOrProvider: ethers.Signer | ethers.providers.Provider) {
    this._worker = PancakeswapV2Worker02__factory.connect(_workerAddress, _signerOrProvider);
  }

  public async validateConfig(
    vaultAddress: string,
    vaultToken: string,
    routerAddress: string,
    workerInfo: WorkersEntity
  ): Promise<void> {
    try {
      expect(await this._worker.operator()).to.be.eq(vaultAddress, "operator mis-config");
      expect(workerInfo.stakingToken).to.be.eq(await this._worker.lpToken(), "stakingToken mis-config");
      expect(workerInfo.pId).to.be.eq(await this._worker.pid(), "pool id mis-config");
      expect(workerInfo.stakingTokenAt).to.be.eq(await this._worker.masterChef(), "masterChef mis-config");
      // @notice handle BETH-ETH as it is the old version of PancakeswapWorker
      if (workerInfo.name !== "BETH-ETH PancakeswapWorker") {
        expect(await this._worker.router()).to.be.eq(routerAddress, "router mis-config");
        expect(await this._worker.fee()).to.be.eq("9975");
        expect(await this._worker.feeDenom()).to.be.eq("10000");
      }
      expect(await this._worker.baseToken()).to.be.eq(vaultToken, "baseToken mis-config");
      expect(await this._worker.okStrats(workerInfo.strategies.StrategyAddAllBaseToken)).to.be.eq(
        true,
        "mis-config on add base token only strat"
      );
      expect(await this._worker.okStrats(workerInfo.strategies.StrategyLiquidate)).to.be.eq(
        true,
        "mis-config on liquidate strat"
      );
      expect(await this._worker.okStrats(workerInfo.strategies.StrategyAddTwoSidesOptimal)).to.be.eq(
        true,
        "mis-config on add two sides strat"
      );
      expect(await this._worker.okStrats(workerInfo.strategies.StrategyWithdrawMinimizeTrading)).to.be.eq(
        true,
        "mis-config on minimize trading strat"
      );
      if (workerInfo.strategies.StrategyPartialCloseLiquidate != "") {
        expect(await this._worker.okStrats(workerInfo.strategies.StrategyPartialCloseLiquidate)).to.be.eq(
          true,
          "mis-config on partial close liquidate strat"
        );
      }
      if (workerInfo.strategies.StrategyPartialCloseMinimizeTrading != "") {
        expect(await this._worker.okStrats(workerInfo.strategies.StrategyPartialCloseMinimizeTrading)).to.be.eq(
          true,
          "mis-config on partial close minimize"
        );
      }

      console.log(`> ✅ done validated ${workerInfo.name}, no problem found`);
    } catch (e) {
      console.log(`> ❌ some problem found in ${workerInfo.name}, please double check`);
      console.log(e);
    }
  }
}
