import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedCakeMaxiStrategyLiquidate__factory,
  CakeMaxiWorker,
  CakeMaxiWorker__factory,
  Timelock__factory,
} from '../typechain';

interface IWorkerParams {
  WORKER_NAME: string
  VAULT_CONFIG_ADDR: string
  WORKER_CONFIG_ADDR: string
  REINVEST_BOT: string
  POOL_ID: number
  VAULT_ADDR: string
  BASE_TOKEN_ADDR: string
  MASTER_CHEF_ADDR: string
  PANCAKESWAP_ROUTER_ADDR: string
  ADD_STRAT_ADDR: string
  LIQ_STRAT_ADDR: string
  REINVEST_BOUNTY_BPS: string
  WORK_FACTOR: string
  KILL_FACTOR: string
  MAX_PRICE_DIFF: string
  TIMELOCK: string
  EXACT_ETA: string
  STRATS: Array<string>
}

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
  const WORKERS: Array<IWorkerParams> = [{
    WORKER_NAME: "BRY-WBNB Worker",
    VAULT_CONFIG_ADDR: '0x53dbb71303ad0F9AFa184B8f7147F9f12Bb5Dc01',
    WORKER_CONFIG_ADDR: '0xADaBC5FC5da42c85A84e66096460C769a151A8F8',
    REINVEST_BOT: '0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De',
    POOL_ID: 303,
    VAULT_ADDR: '0xd7D069493685A581d27824Fc46EdA46B7EfC0063',
    BASE_TOKEN_ADDR: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    MASTER_CHEF_ADDR: '0x73feaa1eE314F8c655E354234017bE2193C9E24E',
    PANCAKESWAP_ROUTER_ADDR: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    ADD_STRAT_ADDR: '0x4c7a420142ec69c7Df5c6C673D862b9E030743bf',
    LIQ_STRAT_ADDR: '0x9Da5D593d08B062063F81913a08e04594F84d438',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '4500',
    KILL_FACTOR: '7000',
    MAX_PRICE_DIFF: '11000',
    TIMELOCK: '0x2D5408f2287BF9F9B05404794459a846651D0a59',
    EXACT_ETA: '1620797400',
    STRATS: [
      '0xB9B8766B65636779C3B169B9a18e0A708F91c610',
      '0x55fCc2Dfb1a26e58b1c92a7C85bD2946037A9419'
    ]
  }]









  for(let i = 0; i < WORKERS.length; i++) {
    console.log("===================================================================================")
    console.log(`>> Deploying an upgradable CakeMaxiWorker contract for ${WORKERS[i].WORKER_NAME}`);
    const CakeMaxiWorker = (await ethers.getContractFactory(
      'CakeMaxiWorker',
      (await ethers.getSigners())[0]
    )) as CakeMaxiWorker__factory;
    const cakeMaxiWorker = await upgrades.deployProxy(
      CakeMaxiWorker,[
        WORKERS[i].VAULT_ADDR, WORKERS[i].BASE_TOKEN_ADDR, WORKERS[i].MASTER_CHEF_ADDR,
        WORKERS[i].PANCAKESWAP_ROUTER_ADDR, WORKERS[i].POOL_ID, WORKERS[i].ADD_STRAT_ADDR,
        WORKERS[i].LIQ_STRAT_ADDR, WORKERS[i].REINVEST_BOUNTY_BPS
      ]
    ) as CakeMaxiWorker;
    await cakeMaxiWorker.deployed();
    console.log(`>> Deployed at ${cakeMaxiWorker.address}`);

    console.log(`>> Adding REINVEST_BOT`);
    await cakeMaxiWorker.setReinvestorOk([WORKERS[i].REINVEST_BOT], true);
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    await cakeMaxiWorker.setStrategyOk(WORKERS[i].STRATS, true);
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on strats`);
    const addStrat = PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly__factory.connect(WORKERS[i].ADD_STRAT_ADDR, (await ethers.getSigners())[0])
    await addStrat.setWorkersOk([cakeMaxiWorker.address], true)
    const liqStrat = PancakeswapV2RestrictedCakeMaxiStrategyLiquidate__factory.connect(WORKERS[i].LIQ_STRAT_ADDR, (await ethers.getSigners())[0])
    await liqStrat.setWorkersOk([cakeMaxiWorker.address], true)
    for(let j = 0; j < WORKERS[i].STRATS.length; j++) {
      const strat = PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly__factory.connect(WORKERS[i].STRATS[j], (await ethers.getSigners())[0])
      await strat.setWorkersOk([cakeMaxiWorker.address], true)
    }
    console.log("✅ Done");

    const timelock = Timelock__factory.connect(WORKERS[i].TIMELOCK, (await ethers.getSigners())[0]);

    console.log(">> Timelock: Setting WorkerConfig via Timelock");
    const setConfigsTx = await timelock.queueTransaction(
      WORKERS[i].WORKER_CONFIG_ADDR, '0',
      'setConfigs(address[],(bool,uint64,uint64,uint64)[])',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],
        [
          [cakeMaxiWorker.address], [{acceptDebt: true, workFactor: WORKERS[i].WORK_FACTOR, killFactor: WORKERS[i].KILL_FACTOR, maxPriceDiff: WORKERS[i].MAX_PRICE_DIFF}]
        ]
      ), WORKERS[i].EXACT_ETA
    );
    console.log(`queue setConfigs at: ${setConfigsTx.hash}`)
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i].WORKER_CONFIG_ADDR}', '0', 'setConfigs(address[],(bool,uint64,uint64,uint64)[])', ethers.utils.defaultAbiCoder.encode(['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],[['${cakeMaxiWorker.address}'], [{acceptDebt: true, workFactor: ${WORKERS[i].WORK_FACTOR}, killFactor: ${WORKERS[i].KILL_FACTOR}, maxPriceDiff: ${WORKERS[i].MAX_PRICE_DIFF}}]]), ${WORKERS[i].EXACT_ETA})`)
    console.log("✅ Done");

    console.log(">> Timelock: Linking VaultConfig with WorkerConfig via Timelock");
    const setWorkersTx = await timelock.queueTransaction(
      WORKERS[i].VAULT_CONFIG_ADDR, '0',
      'setWorkers(address[],address[])',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','address[]'],
        [
          [cakeMaxiWorker.address], [WORKERS[i].WORKER_CONFIG_ADDR]
        ]
      ), WORKERS[i].EXACT_ETA
    );
    console.log(`queue setWorkers at: ${setWorkersTx.hash}`)
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i].VAULT_CONFIG_ADDR}', '0','setWorkers(address[],address[])', ethers.utils.defaultAbiCoder.encode(['address[]','address[]'],[['${cakeMaxiWorker.address}'], ['${WORKERS[i].WORKER_CONFIG_ADDR}']]), ${WORKERS[i].EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['CakeMaxiWorkers'];