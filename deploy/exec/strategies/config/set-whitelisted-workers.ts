import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Timelock__factory } from '../../../../typechain'


interface ISetWhitelistedStratWorkers {
  STRAT_NAME: string
  STRAT_ADDR: string
  WORKERS: Array<string>
}

type ISetWhitelistedStratsWorkers = Array<ISetWhitelistedStratWorkers>

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
  const WHITELISTED_STRATS_WORKERS: ISetWhitelistedStratsWorkers = []
 
  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1619676000';











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  
  for(let i = 0; i < WHITELISTED_STRATS_WORKERS.length; i++) {
    const params = WHITELISTED_STRATS_WORKERS[i]
    console.log(`>> Timelock: adding ${JSON.stringify(params.WORKERS)} as a whitelisted workers of: "${params.STRAT_NAME}" via Timelock`);
    await timelock.queueTransaction(
        params.STRAT_ADDR, '0',
        'setWorkersOk(address[],bool)',
        ethers.utils.defaultAbiCoder.encode(
            ['address[]', 'bool'],
            [
              params.WORKERS,
              true
            ]
        ), EXACT_ETA
    );
    const worker_addresses = params.WORKERS.map((worker) => `'${worker}'`)
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${params.STRAT_ADDR}', '0', 'setWorkersOk(address[],bool)', ethers.utils.defaultAbiCoder.encode(['address[]','bool'],[[${worker_addresses}], true]), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockSetSharedStratsWhitelistedWorkers'];