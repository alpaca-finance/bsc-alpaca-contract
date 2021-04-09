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

  const WORKER_CONFIG_ADDR = '0xADaBC5FC5da42c85A84e66096460C769a151A8F8';

  const UPDATES = [{
    WORKER_ADDRESS: '0xC5954CA8988988362f60498d5aDEc67BA466492B',
    ACCEPT_DEBT: true,
    WORK_FACTOR: '8600',
    KILL_FACTOR: '9400',
    MAX_PRICE_DIFF: '11000',
  }]

  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1617015600';











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