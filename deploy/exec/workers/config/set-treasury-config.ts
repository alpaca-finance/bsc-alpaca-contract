import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TimelockEntity } from '../../../entities';
import { mapWorkers } from '../../../entities/worker';
import { FileService, TimelockService } from '../../../services';

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
  const workerInputs: Array<string> = [
    "WBNB CakeMaxiWorker",
    "BUSD CakeMaxiWorker",
    "ETH CakeMaxiWorker",
    "USDT CakeMaxiWorker",
    "BTCB CakeMaxiWorker",
  ]
  const TREASURY_ACCOUNT = '0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De';
  const TREASURY_BOUNTY_BPS = '1900';
  const EXACT_ETA = '1626857100';









  const targetedWorkers = mapWorkers(workerInputs)
  const timelockTransactions: Array<TimelockEntity.Transaction> = []

  for(const targetedWorker of targetedWorkers) {
    timelockTransactions.push(await TimelockService.queueTransaction(
      `set treasury account for ${targetedWorker.name}`,
      targetedWorker.address,
      '0',
      'setTreasuryConfig(address,uint256)',
      ['address','uint256'],
      [TREASURY_ACCOUNT, TREASURY_BOUNTY_BPS],
      EXACT_ETA
    ))
  }

  await FileService.write('set-treasury-config', timelockTransactions)
};

export default func;
func.tags = ['TimelockAddTreasuryFieldsWorkers02'];