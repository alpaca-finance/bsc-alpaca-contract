import { ContractFactory } from "ethers";
import { CakeMaxiWorker02__factory, PancakeswapV2Worker02__factory, WaultSwapWorker02__factory } from "../../typechain";
import { WorkersEntity } from "../interfaces/config";
import { getConfig } from "./config";

export type IWorkers = Array<WorkersEntity>;

export interface IMiniWorker {
  name: string;
  address: string;
}

export interface IFactory {
  PANCAKESWAP_V2_WORKER_02: PancakeswapV2Worker02__factory;
  WAULTSWAP_WORKER_02: WaultSwapWorker02__factory;
  CAKEMAXI_WORKER_02: CakeMaxiWorker02__factory;
}

/**
 *
 * @description This is a function for getting ContractFactory that is either PancakeswapV2Worker02__factory or WaultSwapWorker02__factory or CakeMaxiWorker02__factory
 * so that each worker will contain a contract factory using for upgrade proxy
 * @param {string} workerName
 * @param {IFactory} factory
 * @return {*}  {ContractFactory}
 */
export function getFactory(workerName: string, factory: IFactory): ContractFactory {
  if (workerName.includes("CakeMaxiWorker")) {
    return factory.CAKEMAXI_WORKER_02;
  }
  if (workerName.includes("PancakeswapWorker")) {
    return factory.PANCAKESWAP_V2_WORKER_02;
  }
  if (workerName.includes("WaultswapWorker")) {
    return factory.WAULTSWAP_WORKER_02;
  }
  throw new Error(`getFactory:: unable to return a factor regarding to the worker ${workerName}`);
}

export function mapWorkers(workerNames: Array<String>): Array<WorkersEntity> {
  const config = getConfig();

  const allWorkers: IWorkers = config.Vaults.reduce((accum, vault) => {
    return accum.concat(
      vault.workers.map((worker) => {
        return worker;
      })
    );
  }, [] as IWorkers);

  const mappedWorkers: IWorkers = workerNames.map((workerName) => {
    // 1. find each worker having an identical name as workerName
    // 2. if hit return
    // 3. other wise throw error
    const hit = allWorkers.find((worker) => {
      return worker.name === workerName;
    });

    if (!!hit) return hit;

    throw new Error(`could not find ${workerName}`);
  });

  return mappedWorkers;
}
