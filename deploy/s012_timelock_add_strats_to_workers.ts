import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Timelock__factory } from '../typechain'
import { time } from 'node:console';

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
  const OK_FLAG = false
  const STRATEGY = [
    '0xd80783De91fbEd9F7995A97D4C02917295F86F68',
    '0xE38EBFE8F314dcaD61d5aDCB29c1A26F41BEd0Be',
    '0xE574dc08aa579720Dfacd70D3DAE883d29874599',
    '0x95Ff1336985723aa46078995454d7A7Fd9F5401e'
  ]

  const ADD_STRAT = ''
  const LIQ_STRAT = ''

  const WORKERS = [
    // Alpaca Vault
    '0xeF1C5D2c20b22Ae50437a2F3bd258Ab1117D1BaD', // BUSD-ALPACA PancakeswapWorker
  ];

  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1620561000';











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  for(let i = 0; i < WORKERS.length; i++) {
    if(ADD_STRAT && LIQ_STRAT) {
      console.log(">> Timelock: Setting critical strat via Timelock");
      await timelock.queueTransaction(
        WORKERS[i], '0',
        'setCriticalStrategies(address,address)',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [ADD_STRAT, LIQ_STRAT]
        ), EXACT_ETA
      )
      console.log("generate timelock.executeTransaction:")
      console.log(`await timelock.executeTransaction('${WORKERS[i]}', '0', 'setCriticalStrategies(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'],['${ADD_STRAT}', '${LIQ_STRAT}']), ${EXACT_ETA})`)
      console.log("✅ Done");
    }

    console.log(">> Timelock: Setting okStrats via Timelock");
    await timelock.queueTransaction(
      WORKERS[i], '0',
      'setStrategyOk(address[],bool)',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','bool'],
        [
          STRATEGY, false
        ]
      ), EXACT_ETA
    );
    const strats = STRATEGY.map((strat) => `'${strat}'`)
    const ok = 'false'
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i]}', '0', 'setStrategyOk(address[],bool)', ethers.utils.defaultAbiCoder.encode(['address[]','bool'],[[${strats}], ${ok}]), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockUpdateAddStratWorkers'];