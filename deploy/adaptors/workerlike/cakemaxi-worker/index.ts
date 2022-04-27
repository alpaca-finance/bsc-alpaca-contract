import { expect } from "chai";
import { ethers } from "ethers";
import { CakeMaxiWorker02MCV2, CakeMaxiWorker02MCV2__factory } from "../../../../typechain";
import { WorkersEntity } from "../../../interfaces/config";
import { IMultiCallService } from "../../../services/multicall/interfaces";
import { IWorkerLike } from "../IWorkerLike";

export class CakeMaxiWorkerAdaptor implements IWorkerLike {
  private _worker: CakeMaxiWorker02MCV2;
  private _multiCallService: IMultiCallService;

  constructor(
    _workerAddress: string,
    _multiCallService: IMultiCallService,
    _signerOrProvider: ethers.Signer | ethers.providers.Provider
  ) {
    this._worker = CakeMaxiWorker02MCV2__factory.connect(_workerAddress, _signerOrProvider);
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
        workerFarmingToken,
        workerPid,
        workerCakePool,
        workerRouter,
        workerFee,
        workerFeeDenom,
        workerBaseToken,
        workerAddBaseTokenOk,
        workerLiqOk,
        workerTwoSidesOk,
        workerMinimizeOk,
        workerPartialCloseLiqOk,
        workerPartialCloseMinimizeOk,
      ] = await this._multiCallService.multiContractCall<
        [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          boolean,
          boolean,
          boolean,
          boolean,
          boolean,
          boolean
        ]
      >([
        { contract: this._worker, functionName: "operator" },
        { contract: this._worker, functionName: "farmingToken" },
        { contract: this._worker, functionName: "pid" },
        { contract: this._worker, functionName: "cakePool" },
        { contract: this._worker, functionName: "router" },
        { contract: this._worker, functionName: "fee" },
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
      expect(workerFarmingToken).to.be.eq(workerInfo.stakingToken, "stakingToken mis-config");
      expect(workerPid).to.be.eq(workerInfo.pId, "pool id mis-config");
      expect(workerCakePool).to.be.eq(workerInfo.stakingTokenAt, "cakePool mis-config");
      expect(workerRouter).to.be.eq(routerAddress, "router mis-config");
      expect(workerFee).to.be.eq("9975");
      expect(workerFeeDenom).to.be.eq("10000");
      expect(workerBaseToken).to.be.eq(vaultToken, "baseToken mis-config");
      expect(workerAddBaseTokenOk).to.be.eq(true, "mis-config on add base token only strat");
      expect(workerLiqOk).to.be.eq(true, "mis-config on liquidate strat");
      expect(workerTwoSidesOk).to.be.eq(true, "mis-config on add two sides strat");
      expect(workerMinimizeOk).to.be.eq(true, "mis-config on minimize trading strat");
      if (workerInfo.strategies.StrategyPartialCloseLiquidate !== "")
        expect(workerPartialCloseLiqOk).to.be.eq(true, "mis-config on partial close liquidate strat");
      if (workerInfo.strategies.StrategyPartialCloseMinimizeTrading !== "")
        expect(workerPartialCloseMinimizeOk).to.be.eq(true, "mis-config on partial close minimize");

      console.log(`> ✅ done validated ${workerInfo.name}, no problem found`);
    } catch (e) {
      console.log(`> ❌ some problem found in ${workerInfo.name}, please double check`);
      console.log(e);
    }
  }
}
