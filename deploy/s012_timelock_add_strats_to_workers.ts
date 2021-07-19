import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Timelock__factory } from '../typechain'
import { mapWorkers } from './entities/worker';
import { getConfig } from './entities/config';

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
    "USDT CakeMaxiWorker",
    "ETH CakeMaxiWorker",
    "BUSD CakeMaxiWorker",
    "WBNB CakeMaxiWorker",
    "TUSD CakeMaxiWorker",
  ];
  const EXACT_ETA = '1626685200';










  const config = getConfig()
  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);
  const workerAddrs = mapWorkers(WORKERS).map((w) => w.address)
  const executionTxs: Array<String> = []

  for(const workerAddr of workerAddrs) {
    if(ADD_STRAT && LIQ_STRAT) {
      console.log(">> Timelock: Setting critical strat via Timelock");
      await timelock.queueTransaction(
        workerAddr, '0',
        'setCriticalStrategies(address,address)',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [ADD_STRAT, LIQ_STRAT]
        ), EXACT_ETA
      )
      console.log("generate timelock.executeTransaction:")
      console.log(`await timelock.executeTransaction('${workerAddr}', '0', 'setCriticalStrategies(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'],['${ADD_STRAT}', '${LIQ_STRAT}']), ${EXACT_ETA})`)
      console.log("✅ Done");
    }

    console.log(">> Timelock: Setting okStrats via Timelock");
    await timelock.queueTransaction(
      workerAddr, '0',
      'setStrategyOk(address[],bool)',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','bool'],
        [
          STRATEGY, OK_FLAG
        ]
      ), EXACT_ETA
    );
    const strats = STRATEGY.map((strat) => `'${strat}'`)
    console.log("generate timelock.executeTransaction:")
    const executionTx = `await timelock.executeTransaction('${workerAddr}', '0', 'setStrategyOk(address[],bool)', ethers.utils.defaultAbiCoder.encode(['address[]','bool'],[[${strats}], ${OK_FLAG}]), ${EXACT_ETA})`
    console.log(executionTx)
    console.log("✅ Done");

    executionTxs.push(`// Approve strats for ${workerAddr}\n${executionTx}\n`)
  }

  console.log("\n\n\n")
  for(const exTx of executionTxs) console.log(exTx)
};

export default func;
func.tags = ['TimelockUpdateAddStratWorkers'];