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
    WORKER_ADDRESS: '0xd06d9B0bA226DE48399Ed3b06ceB39eE8F62C0A0',
    ACCEPT_DEBT: false,
    WORK_FACTOR: '7800',
    KILL_FACTOR: '9000',
    MAX_PRICE_DIFF: '11000',
  }]

  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1620872100';











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
      ), EXACT_ETA, { gasPrice: 300000000000 }
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKER_CONFIG_ADDR}', '0', 'setConfigs(address[],(bool,uint64,uint64,uint64)[])', ethers.utils.defaultAbiCoder.encode(['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],[['${UPDATES[i].WORKER_ADDRESS}'], [{acceptDebt: ${UPDATES[i].ACCEPT_DEBT}, workFactor: ${UPDATES[i].WORK_FACTOR}, killFactor: ${UPDATES[i].KILL_FACTOR}, maxPriceDiff: ${UPDATES[i].MAX_PRICE_DIFF}}]]), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockUpdateWorkerWorkerConfigParams'];