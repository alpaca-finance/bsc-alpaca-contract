import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { IWorker__factory, IStrategy__factory, Timelock__factory } from '../typechain'

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

  const WORKER_CONFIG_ADDR = '0x8ae5e14864090E9332Ceb238F7cEa183d7C056a7';

  const UPDATES = [{
    WORKER_ADDRESS: '0x933d7fABE41cBc5e9483bD8CD0407Cf375a8e0C3',
    ACCEPT_DEBT: true,
    WORK_FACTOR: '5200',
    KILL_FACTOR: '7000',
    MAX_PRICE_DIFF: '18000',
  }]

  const TIMELOCK = '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337';
  const EXACT_ETA = '1618385160';











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  for(let i = 0; i < UPDATES.length; i++) {
    console.log(">> Timelock: Setting WorkerConfig via Timelock");
    await timelock.queueTransaction(
      WORKER_CONFIG_ADDR, '0',
      'setConfigs(address[],(bool,uint64,uint64,uint64)[])',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],
        [
          [UPDATES[i].WORKER_ADDRESS], [{acceptDebt: UPDATES[i].ACCEPT_DEBT, workFactor: UPDATES[i].WORK_FACTOR, killFactor: UPDATES[i].KILL_FACTOR, maxPriceDiff: UPDATES[i].MAX_PRICE_DIFF}]
        ]
      ), EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKER_CONFIG_ADDR}', '0', 'setConfigs(address[],(bool,uint64,uint64,uint64)[])', ethers.utils.defaultAbiCoder.encode(['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],[['${UPDATES[i].WORKER_ADDRESS}'], [{acceptDebt: true, workFactor: ${UPDATES[i].WORK_FACTOR}, killFactor: ${UPDATES[i].KILL_FACTOR}, maxPriceDiff: ${UPDATES[i].MAX_PRICE_DIFF}}]]), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockUpdateWorkerWorkerConfigParams'];