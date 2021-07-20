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

  const OK_FLAG = false
  const STRATEGY = [
    '0xDec689385Fee29516D221D887F9C1535Ae066bD1',
  ]
  const WORKERS = [
    "BUSD-BTCB WaultswapWorker",
    "USDT-BTCB WaultswapWorker",
    "ETH-BTCB WaultswapWorker",
    "MATIC-USDT WaultswapWorker",
    "ETH-USDT WaultswapWorker",
    "BTCB-USDT WaultswapWorker",
    "BUSD-USDT WaultswapWorker",
    "WEX-USDT WaultswapWorker",
    "ALPACA-USDT WaultswapWorker",
    "WBNB-ALPACA WaultswapWorker",
    "USDT-ALPACA WaultswapWorker",
    "USDT-ETH WaultswapWorker",
    "BETH-ETH WaultswapWorker",
    "BTCB-ETH WaultswapWorker",
    "BUSD-ETH WaultswapWorker",
    "BTCB-BUSD WaultswapWorker",
    "USDT-BUSD WaultswapWorker",
    "WBNB-BUSD WaultswapWorker",
    "ETH-BUSD WaultswapWorker",
    "WAULTx-WBNB WaultswapWorker",
    "ALPACA-WBNB WaultswapWorker",
    "BUSD-WBNB WaultswapWorker",
    "WEX-WBNB WaultswapWorker",
  ];
  const EXACT_ETA = '1626775800';










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