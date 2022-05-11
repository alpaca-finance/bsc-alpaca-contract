import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { ContractFactory } from "ethers";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";

interface IWorker {
  WORKER_NAME: string;
  ADDRESS: string;
}

type IWorkers = Array<IWorker>;

type IWorkerInputs = Array<string>;

interface FactoryMap {
  workerType: string;
  newVersion: string;
}

/**
 *
 * @description This is a function for getting ContractFactory that is either PancakeswapV2Worker02__factory or WaultSwapWorker02__factory or CakeMaxiWorker02__factory
 * so that each worker will contain a contract factory using for upgrade proxy
 * @param {string} workerName
 * @param {Array<FactoryMap>} factories
 * @return {*}  {ContractFactory}
 */
async function getFactory(workerName: string, factories: Array<FactoryMap>): Promise<ContractFactory> {
  if (workerName.includes("DeltaNeutralPancakeswapWorker")) {
    const factory = factories.find((f) => f.workerType == "DeltaNeutralPancakeswapWorker");
    if (!factory) throw new Error("not found new DeltaNeutralPancakeswapWorker factory");
    return await ethers.getContractFactory(factory.newVersion);
  }
  if (workerName.includes("CakeMaxiWorker")) {
    const factory = factories.find((f) => f.workerType == "CakeMaxiWorker");
    if (!factory) throw new Error("not found new CakeMaxiWorker factory");
    return await ethers.getContractFactory(factory.newVersion);
  }
  if (workerName.includes("PancakeswapWorker")) {
    const factory = factories.find((f) => f.workerType === "PancakeswapWorker");
    if (!factory) throw new Error("not found new PancakeswapWorker factory");
    return await ethers.getContractFactory(factory.newVersion);
  }
  if (workerName.includes("MdexWorker")) {
    const factory = factories.find((f) => f.workerType === "MdexWorker");
    if (!factory) throw new Error("not found new MdexWorker factory");
    return await ethers.getContractFactory(factory.newVersion);
  }

  throw new Error(`getFactory:: unable to return a factor regarding to the worker ${workerName}`);
}

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
  const fileName = "upgrade-pcs-cakemaxi-cakepool-totalBalance";
  const factories: Array<FactoryMap> = [
    {
      workerType: "CakeMaxiWorker",
      newVersion: "CakeMaxiWorker02MCV2",
    },
  ];
  const workerInputs: IWorkerInputs = [
    "WBNB CakeMaxiWorker",
    "BUSD CakeMaxiWorker",
    "ETH CakeMaxiWorker",
    "USDT CakeMaxiWorker",
    "BTCB CakeMaxiWorker",
    "TUSD CakeMaxiWorker",
    "USDC CakeMaxiWorker",
  ];
  const EXACT_ETA = "1651233600";

  const config = ConfigEntity.getConfig();
  const ts = Math.floor(new Date().getTime() / 1000);
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

  // Map each TO_BE_UPGRADE_WORKERS with related factory
  // Do it here so error throw here before queue timelock
  const contractFactories: Array<ContractFactory> = [];
  for (let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    contractFactories.push(await getFactory(TO_BE_UPGRADE_WORKERS[i].WORKER_NAME, factories));
  }

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  for (let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    console.log("-------");
    console.log(`>> Preparing to upgrade ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME}`);
    const NewWorkerFactory: ContractFactory = contractFactories[i];
    const preparedNewWorker: string = await upgrades.prepareUpgrade(TO_BE_UPGRADE_WORKERS[i].ADDRESS, NewWorkerFactory);

    console.log(`>> New implementation deployed at: ${preparedNewWorker}`);
    console.log("✅ Done");

    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `upgrade ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME}`,
        config.ProxyAdmin,
        "0",
        "upgrade(address,address)",
        ["address", "address"],
        [TO_BE_UPGRADE_WORKERS[i].ADDRESS, preparedNewWorker],
        EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("20", "gwei") }
      )
    );

    fileService.writeJson(`${ts}_${fileName}`, timelockTransactions);
  }
};

export default func;
func.tags = ["UpgradeWorkers"];
