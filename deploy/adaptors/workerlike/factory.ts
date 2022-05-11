import { ethers } from "ethers";
import { WorkerLike } from "../../entities/worker-like";
import { IMultiCallService } from "../../services/multicall/interfaces";
import { BiswapWorkerAdaptor } from "./biswap-worker";
import { CakeMaxiWorkerAdaptor } from "./cakemaxi-worker";
import { DeltaNeutralPancakeWorkerAdaptor } from "./deltaneutral-pancake-worker";
import { IWorkerLike } from "./IWorkerLike";
import { MdexWorkerAdaptor } from "./mdex-worker";
import { PancakeWorkerAdaptor } from "./pancake-worker";
import { SpookyWorkerAdaptor } from "./spooky-worker";
import { TombWorkerAdaptor } from "./tomb-worker";
import { WaultWorkerAdaptor } from "./wault-worker";

export class WorkerLikeFactory {
  public static newWorkerLike(
    _which: WorkerLike,
    _address: string,
    _multiCallService: IMultiCallService,
    _signerOrProvider: ethers.Signer | ethers.providers.Provider
  ): IWorkerLike {
    if (_which === WorkerLike.cakeMaxi)
      return new CakeMaxiWorkerAdaptor(_address, _multiCallService, _signerOrProvider);
    if (_which === WorkerLike.mdex) return new MdexWorkerAdaptor(_address, _multiCallService, _signerOrProvider);
    if (_which === WorkerLike.pancake) return new PancakeWorkerAdaptor(_address, _multiCallService, _signerOrProvider);
    if (_which === WorkerLike.spooky) return new SpookyWorkerAdaptor(_address, _multiCallService, _signerOrProvider);
    if (_which === WorkerLike.wault) return new WaultWorkerAdaptor(_address, _multiCallService, _signerOrProvider);
    if (_which === WorkerLike.tomb) return new TombWorkerAdaptor(_address, _multiCallService, _signerOrProvider);
    if (_which === WorkerLike.deltaNeutralPancake)
      return new DeltaNeutralPancakeWorkerAdaptor(_address, _multiCallService, _signerOrProvider);
    if (_which === WorkerLike.biswap) return new BiswapWorkerAdaptor(_address, _multiCallService, _signerOrProvider);

    throw new Error("Unknown WorkerLike");
  }
}
