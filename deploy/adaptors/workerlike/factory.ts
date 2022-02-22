import { ethers } from "ethers";
import { WorkerLike } from "../../entities/worker-like";
import { CakeMaxiWorkerAdaptor } from "./cakemaxi-worker";
import { IWorkerLike } from "./IWorkerLike";
import { MdexWorkerAdaptor } from "./mdex-worker";
import { PancakeWorkerAdaptor } from "./pancake-worker";
import { SpookyWorkerAdaptor } from "./spooky-worker";
import { WaultWorkerAdaptor } from "./wault-worker";

export class WorkerLikeFactory {
  public static newWorkerLike(
    _which: WorkerLike,
    _address: string,
    _signerOrProvider: ethers.Signer | ethers.providers.Provider
  ): IWorkerLike {
    if (_which === WorkerLike.cakeMaxi) return new CakeMaxiWorkerAdaptor(_address, _signerOrProvider);
    if (_which === WorkerLike.mdex) return new MdexWorkerAdaptor(_address, _signerOrProvider);
    if (_which === WorkerLike.pancake) return new PancakeWorkerAdaptor(_address, _signerOrProvider);
    if (_which === WorkerLike.spooky) return new SpookyWorkerAdaptor(_address, _signerOrProvider);
    if (_which === WorkerLike.wault) return new WaultWorkerAdaptor(_address, _signerOrProvider);

    throw new Error("Unknown WorkerLike");
  }
}
