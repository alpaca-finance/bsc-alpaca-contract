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
  const OK_FLAG = true
  const STRATEGY = [
    '0x2943b6fC64bDF5bD26E9DFeB9b35d1DBcbdE936C',
    '0x58Bbb507248635413172Ed7A2eeC048402C6b39b',
    '0xD8196dc675E92021aC40d42a8cF437789CD1aC32',
    '0xdA6031c074d41A28dF8827B3cF6B66352eA3Ba7A'
  ]

  const ADD_STRAT = '0x2943b6fC64bDF5bD26E9DFeB9b35d1DBcbdE936C'
  const LIQ_STRAT = '0x58Bbb507248635413172Ed7A2eeC048402C6b39b'

  const WORKERS = [
    '0x4Ce9EBac0b85c406af33d2Ba92502F4317511e18',
  ];

  const TIMELOCK = '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337';
  const EXACT_ETA = '1620467700';











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
          STRATEGY, true
        ]
      ), EXACT_ETA
    );
    const strats = STRATEGY.map((strat) => `'${strat}'`)
    const ok = OK_FLAG == true ? 'true' : 'false'
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i]}', '0', 'setStrategyOk(address[],bool)', ethers.utils.defaultAbiCoder.encode(['address[]','bool'],[[${strats}], ${ok}]), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockUpdateAddStratWorkers'];