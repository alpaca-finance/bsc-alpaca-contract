import { ethers, network } from "hardhat";
import "@openzeppelin/test-helpers";
import { WorkerConfig__factory } from "../typechain";
import MainnetConfig from '../.mainnet.json'
import TestnetConfig from '../.testnet.json'

interface IWorkerInfo {
  name: string;
  address: string;
  config: string;
  pId: number;
  stakingToken: string;
  stakingTokenAt: string;
  strategies: {
    StrategyAddAllBaseToken: string;
    StrategyLiquidate: string;
    StrategyAddTwoSidesOptimal: string;
    StrategyWithdrawMinimizeTrading: string;
  };
}

async function queryWorkerConfigs(workerInfo: IWorkerInfo) {
  const workerConfig = WorkerConfig__factory.connect(workerInfo.config, ethers.provider)
  const config = await workerConfig.workers(workerInfo.address)
  console.log(`name: ${workerInfo.name}, acceptDebt: ${config.acceptDebt}, workFactor: ${config.workFactor}, killFactor: ${config.killFactor}, maxPriceDiff: ${config.maxPriceDiff}`)
}

async function main() {
  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  
  for(let i = 0; i < config.Vaults.length; i++) {
    const promises = []
    for (const worker of config.Vaults[i].workers) {
      promises.push(
        queryWorkerConfigs(worker)
      )
    }
    await Promise.all(promises)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })