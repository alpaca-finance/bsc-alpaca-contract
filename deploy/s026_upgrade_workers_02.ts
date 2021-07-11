import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades, network } from 'hardhat';
import { Timelock__factory, PancakeswapV2Worker, PancakeswapV2Worker__factory, PancakeswapV2WorkerMigrate, PancakeswapV2WorkerMigrate__factory, WaultSwapWorker02__factory, CakeMaxiWorker02__factory, PancakeswapV2Worker02__factory } from '../typechain'
import MainnetConfig from '../.mainnet.json'
import TestnetConfig from '../.testnet.json'
import { ContractFactory } from 'ethers';


interface IWorker {
  WORKER_NAME: string,
  ADDRESS: string
}

type IWorkers = Array<IWorker>

type IWorkerInputs = Array<string>

interface IFactory {
  PANCAKESWAP_V2_WORKER_02: PancakeswapV2Worker02__factory
  WAULTSWAP_WORKER_02: WaultSwapWorker02__factory
  CAKEMAXI_WORKER_02: CakeMaxiWorker02__factory
}
/**
 *
 * @description This is a function for getting ContractFactory that is either PancakeswapV2Worker02__factory or WaultSwapWorker02__factory or CakeMaxiWorker02__factory
 * so that each worker will contain a contract factory using for upgrade proxy
 * @param {string} workerName
 * @param {IFactory} factory
 * @return {*}  {ContractFactory}
 */
const getFactory = (workerName: string, factory: IFactory ): ContractFactory => {
  if (workerName.includes('CakeMaxiWorker')) {
    return factory.CAKEMAXI_WORKER_02
  }
  if (workerName.includes('PancakeswapWorker')) {
    return factory.PANCAKESWAP_V2_WORKER_02
  }
  if (workerName.includes('WaultswapWorker')) {
    return factory.WAULTSWAP_WORKER_02
  }
  throw new Error(`getFactory:: unable to return a factor regarding to the worker ${workerName}`)
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
  const workerInputs: IWorkerInputs = [
    "BUSD-ALPACA PancakeswapWorker"   
  ]
  const NEW_IMPL = '';
  const EXACT_ETA = '1626087600';








  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  const allWorkers: IWorkers = config.Vaults.reduce((accum, vault) => {
    return accum.concat(vault.workers.map(worker => {
      return {
        WORKER_NAME: worker.name,
        ADDRESS: worker.address
      }
    }))
  }, [] as IWorkers)
  const TO_BE_UPGRADE_WORKERS: IWorkers = workerInputs.map((workerInput) => {
    // 1. find each worker having an identical name as workerInput
    // 2. if hit return
    // 3. other wise throw error
    const hit = allWorkers.find((worker) => {
      return worker.WORKER_NAME === workerInput
    })

    if(!!hit) return hit

    throw new Error(`could not find ${workerInput}`)
  })
  const [pancakeSwapV2Worker02Factory, waultSwapWorker02Factory, cakeMaxiWorker02Factory] = await Promise.all([
    (await ethers.getContractFactory('PancakeswapV2Worker02')) as PancakeswapV2Worker02__factory,
    (await ethers.getContractFactory('WaultSwapWorker02')) as WaultSwapWorker02__factory,
    (await ethers.getContractFactory('CakeMaxiWorker02')) as CakeMaxiWorker02__factory,
  ])
  
  const FACTORY: IFactory = {
    PANCAKESWAP_V2_WORKER_02: pancakeSwapV2Worker02Factory,
    WAULTSWAP_WORKER_02: waultSwapWorker02Factory,
    CAKEMAXI_WORKER_02: cakeMaxiWorker02Factory,
  }
  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  let newImpl = NEW_IMPL;
  // if newImpl doesn't exist, use the first record as a name to find the factory
  if (newImpl === '') {
    console.log('>> NEW_IMPL is not set. Prepare upgrade a new IMPL automatically.');
    const NewPancakeswapWorker: ContractFactory = getFactory(TO_BE_UPGRADE_WORKERS[0].WORKER_NAME, FACTORY)
    const preparedNewWorker: string = await upgrades.prepareUpgrade(TO_BE_UPGRADE_WORKERS[0].ADDRESS, NewPancakeswapWorker)
    newImpl = preparedNewWorker;
    console.log(`>> New implementation deployed at: ${preparedNewWorker}`);
    console.log("✅ Done");
  }

  for(let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    console.log(`>> Upgrading worker: ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME} at ${TO_BE_UPGRADE_WORKERS[i].ADDRESS} through Timelock + ProxyAdmin`)
    console.log(`>> Queue tx on Timelock to upgrade the implementation`);
    await timelock.queueTransaction(config.ProxyAdmin, '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], [TO_BE_UPGRADE_WORKERS[i].ADDRESS, newImpl]), EXACT_ETA, { gasPrice: 100000000000 });
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(`await timelock.executeTransaction('${config.ProxyAdmin}', '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], ['${TO_BE_UPGRADE_WORKERS[i].ADDRESS}','${newImpl}']), ${EXACT_ETA})`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['UpgradeWorkers02'];