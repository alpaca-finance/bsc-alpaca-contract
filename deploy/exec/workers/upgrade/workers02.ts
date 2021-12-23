import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  WaultSwapWorker02__factory,
  CakeMaxiWorker02__factory,
  PancakeswapV2Worker02__factory,
  MdexWorker02__factory,
} from "../../../../typechain";
import { ContractFactory } from "ethers";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";

interface IWorker {
  WORKER_NAME: string;
  ADDRESS: string;
}

type IWorkers = Array<IWorker>;

type IWorkerInputs = Array<string>;

interface IFactory {
  PANCAKESWAP_V2_WORKER_02: PancakeswapV2Worker02__factory;
  WAULTSWAP_WORKER_02: WaultSwapWorker02__factory;
  CAKEMAXI_WORKER_02: CakeMaxiWorker02__factory;
  MDEX_WORKER_02: MdexWorker02__factory;
}
/**
 *
 * @description This is a function for getting ContractFactory that is either PancakeswapV2Worker02__factory or WaultSwapWorker02__factory or CakeMaxiWorker02__factory
 * so that each worker will contain a contract factory using for upgrade proxy
 * @param {string} workerName
 * @param {IFactory} factory
 * @return {*}  {ContractFactory}
 */
const getFactory = (workerName: string, factory: IFactory): ContractFactory => {
  if (workerName.includes("CakeMaxiWorker")) {
    return factory.CAKEMAXI_WORKER_02;
  }
  if (workerName.includes("PancakeswapWorker")) {
    return factory.PANCAKESWAP_V2_WORKER_02;
  }
  if (workerName.includes("WaultswapWorker")) {
    return factory.WAULTSWAP_WORKER_02;
  }
  if (workerName.includes("MdexWorker")) {
    return factory.MDEX_WORKER_02;
  }
  throw new Error(`getFactory:: unable to return a factor regarding to the worker ${workerName}`);
};

/**
 * @description Deployment script for upgrades workers to 02 version
 * @param  {HardhatRuntimeEnvironment} hre
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
  ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
  ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
  ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
  ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
  ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
  ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
  Check all variables below before execute the deployment script
  */
  const fileName = "upgrade-workers";
  const workerInputs: IWorkerInputs = [
    "ITAM-WBNB PancakeswapWorker",
    "BOR-WBNB PancakeswapWorker",
    "BRY-WBNB PancakeswapWorker",
    "BORING-WBNB PancakeswapWorker",
    "TRX-WBNB PancakeswapWorker",
    "BTT-WBNB PancakeswapWorker",
  ];
  const EXACT_ETA = "1639489500";

  const config = ConfigEntity.getConfig();
  const allWorkers: IWorkers = config.Vaults.reduce((accum, vault) => {
    return accum.concat(
      vault.workers.map((worker) => {
        return {
          WORKER_NAME: worker.name,
          ADDRESS: worker.address,
        };
      })
    );
  }, [] as IWorkers);
  const TO_BE_UPGRADE_WORKERS: IWorkers = workerInputs.map((workerInput) => {
    // 1. find each worker having an identical name as workerInput
    // 2. if hit return
    // 3. other wise throw error
    const hit = allWorkers.find((worker) => {
      return worker.WORKER_NAME === workerInput;
    });

    if (!!hit) return hit;

    throw new Error(`could not find ${workerInput}`);
  });
  const [pancakeSwapV2Worker02Factory, waultSwapWorker02Factory, cakeMaxiWorker02Factory, mdexWorker02Factory] =
    await Promise.all([
      (await ethers.getContractFactory("PancakeswapV2Worker02")) as PancakeswapV2Worker02__factory,
      (await ethers.getContractFactory("WaultSwapWorker02")) as WaultSwapWorker02__factory,
      (await ethers.getContractFactory("CakeMaxiWorker02")) as CakeMaxiWorker02__factory,
      (await ethers.getContractFactory("MdexWorker02")) as MdexWorker02__factory,
    ]);

  const FACTORY: IFactory = {
    PANCAKESWAP_V2_WORKER_02: pancakeSwapV2Worker02Factory,
    WAULTSWAP_WORKER_02: waultSwapWorker02Factory,
    CAKEMAXI_WORKER_02: cakeMaxiWorker02Factory,
    MDEX_WORKER_02: mdexWorker02Factory,
  };
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  for (let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    console.log(`>> Preparing to upgrade ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME}`);
    const NewPancakeswapWorker: ContractFactory = getFactory(TO_BE_UPGRADE_WORKERS[i].WORKER_NAME, FACTORY);
    const preparedNewWorker: string = await upgrades.prepareUpgrade(
      TO_BE_UPGRADE_WORKERS[i].ADDRESS,
      NewPancakeswapWorker
    );

    const newImpl = preparedNewWorker;
    console.log(`>> New implementation deployed at: ${preparedNewWorker}`);
    console.log("✅ Done");

    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `upgrade ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME}`,
        config.ProxyAdmin,
        "0",
        "upgrade(address,address)",
        ["address", "address"],
        [TO_BE_UPGRADE_WORKERS[i].ADDRESS, newImpl],
        EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("20", "gwei") }
      )
    );
  }

  FileService.write(fileName, timelockTransactions);
};

export default func;
func.tags = ["UpgradeWorkers02"];
