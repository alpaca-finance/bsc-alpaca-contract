import { expect } from "chai";
import { ethers } from "ethers";
import { MdexWorker02, MdexWorker02__factory } from "../../../../typechain";
import { WorkersEntity } from "../../../interfaces/config";
import { IMultiCallService } from "../../../services/multicall/interfaces";
import { IWorkerLike } from "../IWorkerLike";

export class MdexWorkerAdaptor implements IWorkerLike {
  private _worker: MdexWorker02;
  private _multiCallService: IMultiCallService;

  constructor(
    _workerAddress: string,
    _multiCallService: IMultiCallService,
    _signerOrProvider: ethers.Signer | ethers.providers.Provider
  ) {
    this._worker = MdexWorker02__factory.connect(_workerAddress, _signerOrProvider);
    this._multiCallService = _multiCallService;
  }

  public async validateConfig(
    vaultAddress: string,
    vaultToken: string,
    routerAddress: string,
    workerInfo: WorkersEntity
  ): Promise<void> {
    try {
      const [
        workerOperator,
        workerLpToken,
        workerPid,
        workerBscPool,
        workerRouter,
        workerFeeDenom,
        workerBaseToken,
        workerAddBaseTokenOk,
        workerLiqOk,
        workerTwoSidesOk,
        workerMinimizeOk,
        workerPartialCloseLiqOk,
        workerPartialCloseMinimizeOk,
      ] = await this._multiCallService.multiContractCall<
        [string, string, string, string, string, string, string, boolean, boolean, boolean, boolean, boolean, boolean]
      >([
        { contract: this._worker, functionName: "operator" },
        { contract: this._worker, functionName: "lpToken" },
        { contract: this._worker, functionName: "pid" },
        { contract: this._worker, functionName: "bscPool" },
        { contract: this._worker, functionName: "router" },
        { contract: this._worker, functionName: "feeDenom" },
        { contract: this._worker, functionName: "baseToken" },
        { contract: this._worker, functionName: "okStrats", params: [workerInfo.strategies.StrategyAddAllBaseToken] },
        { contract: this._worker, functionName: "okStrats", params: [workerInfo.strategies.StrategyLiquidate] },
        {
          contract: this._worker,
          functionName: "okStrats",
          params: [workerInfo.strategies.StrategyAddTwoSidesOptimal],
        },
        {
          contract: this._worker,
          functionName: "okStrats",
          params: [workerInfo.strategies.StrategyWithdrawMinimizeTrading],
        },
        {
          contract: this._worker,
          functionName: "okStrats",
          params: [
            workerInfo.strategies.StrategyPartialCloseLiquidate !== ""
              ? workerInfo.strategies.StrategyPartialCloseLiquidate
              : "0x0000000000000000000000000000000000000000",
          ],
        },
        {
          contract: this._worker,
          functionName: "okStrats",
          params: [
            workerInfo.strategies.StrategyPartialCloseMinimizeTrading !== ""
              ? workerInfo.strategies.StrategyPartialCloseMinimizeTrading
              : "0x0000000000000000000000000000000000000000",
          ],
        },
      ]);

      expect(workerOperator).to.be.eq(vaultAddress, "operator mis-config");
      expect(workerLpToken).to.be.eq(workerInfo.stakingToken, "lpToken mis-config");
      expect(workerPid).to.be.eq(workerInfo.pId, "pid mis-config");
      expect(workerBscPool).to.be.eq(workerInfo.stakingTokenAt, "bscPool mis-config");
      expect(workerRouter).to.be.eq(routerAddress, "router mis-config");
      expect(workerBaseToken).to.be.eq(vaultToken, "baseToken mis-config");
      expect(workerFeeDenom).to.be.eq("10000");
      expect(workerAddBaseTokenOk).to.be.eq(true, "mis-config on add base token only strat");
      expect(workerLiqOk).to.be.eq(true, "mis-config on liquidate strat");
      expect(workerTwoSidesOk).to.be.eq(true, "mis-config on add two sides strat");
      expect(workerMinimizeOk).to.be.eq(true, "mis-config on minimize trading strat");
      if (workerInfo.strategies.StrategyPartialCloseLiquidate != "")
        expect(workerPartialCloseLiqOk).to.be.eq(true, "mis-config on partial close liquidate strat");
      if (workerInfo.strategies.StrategyPartialCloseMinimizeTrading != "")
        expect(workerPartialCloseMinimizeOk).to.be.eq(true, "mis-config on partial close minimize");

      console.log(`> ✅ done validated ${workerInfo.name}, no problem found`);
    } catch (e) {
      console.log(`> ❌ some problem found in ${workerInfo.name}, please double check`);
      console.log(e);
    }
  }
}
