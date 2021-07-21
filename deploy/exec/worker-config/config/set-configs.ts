import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, network } from 'hardhat';
import { Timelock__factory } from '../../../../typechain'
import MainnetConfig from '../../../../.mainnet.json'
import TestnetConfig from '../../../../.testnet.json'

interface IInput {
  workerName: string;
  workerAddress: string;
  workerConfigAddress: string;
  acceptDebt: boolean;
  workFactor: string;
  killFactor: string
  maxPriceDiff: string
}

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
  const UPDATES = [{
    WORKER: 'CAKE-WBNB PancakeswapWorker',
    ACCEPT_DEBT: true,
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8000',
    MAX_PRICE_DIFF: '10500',
  }]
  const EXACT_ETA = '1626753600';







  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  const inputs: Array<IInput> = []

  /// @dev derived input
  for(let i = 0; i < UPDATES.length; i++) {
    for(let j = 0; j < config.Vaults.length; j++) {
      const worker = config.Vaults[j].workers.find((w) => w.name == UPDATES[i].WORKER)
      if (worker !== undefined) {
        inputs.push({
          workerName: UPDATES[i].WORKER,
          workerAddress: worker.address,
          workerConfigAddress: worker.config,
          acceptDebt: UPDATES[i].ACCEPT_DEBT,
          workFactor: UPDATES[i].WORK_FACTOR,
          killFactor: UPDATES[i].KILL_FACTOR,
          maxPriceDiff: UPDATES[i].MAX_PRICE_DIFF
        })
        break
      }
    }
  }

  if(inputs.length != UPDATES.length) {
    throw "error: cannot derived all input"
  }

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  for(const input of inputs) {
    console.log(`>> Timelock: Setting WorkerConfig for ${input.workerName} via Timelock`);
    await timelock.queueTransaction(
      input.workerConfigAddress, '0',
      'setConfigs(address[],(bool,uint64,uint64,uint64)[])',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],
        [
          [input.workerAddress], [{acceptDebt: input.acceptDebt, workFactor: input.workFactor, killFactor: input.killFactor, maxPriceDiff: input.maxPriceDiff}]
        ]
      ), EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${input.workerConfigAddress}', '0', 'setConfigs(address[],(bool,uint64,uint64,uint64)[])', ethers.utils.defaultAbiCoder.encode(['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],[['${input.workerAddress}'], [{acceptDebt: ${input.acceptDebt}, workFactor: ${input.workFactor}, killFactor: ${input.killFactor}, maxPriceDiff: ${input.maxPriceDiff}}]]), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockUpdateWorkerWorkerConfigParams'];