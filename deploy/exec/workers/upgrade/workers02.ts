import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  Timelock__factory,
  WaultSwapWorker02__factory,
  CakeMaxiWorker02__factory,
  PancakeswapV2Worker02__factory,
  MdexWorker02__factory,
} from "../../../../typechain";
import { ContractFactory } from "ethers";
import { ConfigEntity } from "../../../entities";

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
  const workerInputs: IWorkerInputs = [
    // "TUSD CakeMaxiWorker",
    // "BTCB CakeMaxiWorker",
    // "USDT CakeMaxiWorker",
    // "ETH CakeMaxiWorker",
    // "BUSD CakeMaxiWorker",
    // "WBNB CakeMaxiWorker",
    // "BUSD-TUSD PancakeswapWorker",
    // "BUSD-BTCB PancakeswapWorker",
    // "WBNB-BTCB PancakeswapWorker",
    // "USDC-USDT PancakeswapWorker",
    // "CAKE-USDT PancakeswapWorker",
    // "WBNB-USDT PancakeswapWorker",
    // "BUSD-USDT PancakeswapWorker",
    // "BUSD-ALPACA PancakeswapWorker",
    // "WBNB-ETH PancakeswapWorker",
    // "SUSHI-ETH PancakeswapWorker",
    // "COMP-ETH PancakeswapWorker",
    // "PHA-BUSD PancakeswapWorker",
    // "PMON-BUSD PancakeswapWorker",
    // "BTT-BUSD PancakeswapWorker",
    // "TRX-BUSD PancakeswapWorker",
    // "ORBS-BUSD PancakeswapWorker",
    // "TUSD-BUSD PancakeswapWorker",
    // "FORM-BUSD PancakeswapWorker",
    // "CAKE-BUSD PancakeswapWorker",
    // "ALPACA-BUSD PancakeswapWorker",
    // "BTCB-BUSD PancakeswapWorker",
    // "UST-BUSD PancakeswapWorker",
    // "DAI-BUSD PancakeswapWorker",
    // "USDC-BUSD PancakeswapWorker",
    // "VAI-BUSD PancakeswapWorker",
    // "WBNB-BUSD PancakeswapWorker",
    // "USDT-BUSD PancakeswapWorker",
    // "DVI-WBNB PancakeswapWorker",
    // "MBOX-WBNB PancakeswapWorker",
    // "NAOS-WBNB PancakeswapWorker",
    // "AXS-WBNB PancakeswapWorker",
    // "BTT-WBNB PancakeswapWorker",
    // "TRX-WBNB PancakeswapWorker",
    // "ADA-WBNB PancakeswapWorker",
    // "ODDZ-WBNB PancakeswapWorker",
    // "USDT-WBNB PancakeswapWorker",
    // "DODO-WBNB PancakeswapWorker",
    // "SWINGBY-WBNB PancakeswapWorker",
    // "pCWS-WBNB PancakeswapWorker",
    // "BELT-WBNB PancakeswapWorker",
    // "bMXX-WBNB PancakeswapWorker",
    // "BUSD-WBNB PancakeswapWorker",
    // "XVS-WBNB PancakeswapWorker",
    // "LINK-WBNB PancakeswapWorker",
    // "UNI-WBNB PancakeswapWorker",
    // "DOT-WBNB PancakeswapWorker",
    // "ETH-WBNB PancakeswapWorker",
    // "BTCB-WBNB PancakeswapWorker",
    // "CAKE-WBNB PancakeswapWorker",
    // "USDT-TUSD WaultswapWorker",
    // "BUSD-BTCB WaultswapWorker",
    // "USDT-BTCB WaultswapWorker",
    // "ETH-BTCB WaultswapWorker",
    // "TUSD-USDT WaultswapWorker",
    // "MATIC-USDT WaultswapWorker",
    // "ETH-USDT WaultswapWorker",
    // "BTCB-USDT WaultswapWorker",
    // "BUSD-USDT WaultswapWorker",
    // "WEX-USDT WaultswapWorker",
    // "ALPACA-USDT WaultswapWorker",
    // "WBNB-ALPACA WaultswapWorker",
    // "USDT-ALPACA WaultswapWorker",
    // "USDT-ETH WaultswapWorker",
    // "BETH-ETH WaultswapWorker",
    // "BTCB-ETH WaultswapWorker",
    // "BUSD-ETH WaultswapWorker",
    // "WUSD-BUSD WaultswapWorker",
    // "BTCB-BUSD WaultswapWorker",
    // "USDT-BUSD WaultswapWorker",
    // "WBNB-BUSD WaultswapWorker",
    // "ETH-BUSD WaultswapWorker",
    // "WAULTx-WBNB WaultswapWorker",
    // "ALPACA-WBNB WaultswapWorker",
    // "BUSD-WBNB WaultswapWorker",
    // "WEX-WBNB WaultswapWorker",
    "BRY-WBNB PancakeswapWorker",
    "BOR-WBNB PancakeswapWorker",
    "ITAM-WBNB PancakeswapWorker",
    "YFI-WBNB PancakeswapWorker",
  ];
  const EXACT_ETA = "1632023220";

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
  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);
  const executionTxs: Array<string> = [];

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

    console.log(
      `>> Upgrading worker: ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME} at ${TO_BE_UPGRADE_WORKERS[i].ADDRESS} through Timelock + ProxyAdmin`
    );
    console.log(`>> Queue tx on Timelock to upgrade the implementation`);
    await timelock.queueTransaction(
      config.ProxyAdmin,
      "0",
      "upgrade(address,address)",
      ethers.utils.defaultAbiCoder.encode(["address", "address"], [TO_BE_UPGRADE_WORKERS[i].ADDRESS, newImpl]),
      EXACT_ETA,
      { gasPrice: 100000000000 }
    );
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    const executionTx = `await timelock.executeTransaction('${config.ProxyAdmin}', '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], ['${TO_BE_UPGRADE_WORKERS[i].ADDRESS}','${newImpl}']), ${EXACT_ETA})`;
    console.log(executionTx);
    console.log("✅ Done");

    executionTxs.push(`// Upgrade ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME} to Worker02\n${executionTx}\n`);
  }

  console.log("\n\n\n");
  for (const exTx of executionTxs) console.log(exTx);
};

export default func;
func.tags = ["UpgradeWorkers02"];
