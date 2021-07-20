import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { mapWorkers } from '../../../entities/worker';
import { FileService, TimelockService } from '../../../services';
import { TimelockEntity, WorkerEntity } from '../../../entities';

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
  const ADD_STRAT = ''
  const LIQ_STRAT = ''

  const OK_FLAG = true
  const STRATEGY = [
    '0x193c3F7e669Baa1C2421affd5EC0Dc879DEBbe44',
    '0x34566a837d46E75468AB0d050B31dA265ffE1E75',
  ]
  const WORKERS = [
    "BTCB CakeMaxiWorker",
  ];
  const EXACT_ETA = '1626783300';










  const miniWorkers: Array<WorkerEntity.IMiniWorker> = mapWorkers(WORKERS).map((w) => {
    return {
      name: w.name,
      address: w.address
    }
  })
  const timelockTransactions: Array<TimelockEntity.Transaction> = []

  for(const miniWorker of miniWorkers) {
    if(ADD_STRAT && LIQ_STRAT) {
      timelockTransactions.push(await TimelockService.queueTransaction(
        `Setting critical strats for ${miniWorker.name}`,
        miniWorker.address,
        '0',
        'setCriticalStrategies(address,address)',
        ['address', 'address'],
        [ADD_STRAT, LIQ_STRAT],
        EXACT_ETA
      ))
    }

    timelockTransactions.push(await TimelockService.queueTransaction(
      `set strategy for ${miniWorker.name}`,
      miniWorker.address,
      '0',
      'setStrategyOk(address[],bool)',
      ['address[]', 'bool'],
      [STRATEGY, OK_FLAG],
      EXACT_ETA
    ))
  }

  await FileService.write('add_strats', timelockTransactions)
};

export default func;
func.tags = ['TimelockUpdateAddStratWorkers'];