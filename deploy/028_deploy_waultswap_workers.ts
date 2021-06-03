import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  WaultSwapRestrictedStrategyAddBaseTokenOnly__factory,
  WaultSwapRestrictedStrategyLiquidate__factory,
  WaultSwapWorker,
  WaultSwapWorker__factory,
  Timelock__factory,
} from '../typechain';

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
  const WORKERS = [{
    WORKER_NAME: "WEX-BNB Worker",
    VAULT_CONFIG_ADDR: '0x53dbb71303ad0F9AFa184B8f7147F9f12Bb5Dc01',
    WORKER_CONFIG_ADDR: '0xADaBC5FC5da42c85A84e66096460C769a151A8F8',
    REINVEST_BOT: '0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De',
    POOL_ID: 2,
    VAULT_ADDR: '0xd7D069493685A581d27824Fc46EdA46B7EfC0063',
    BASE_TOKEN_ADDR: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    WEX_MASTER_ADDR: '0x22fB2663C7ca71Adc2cc99481C77Aaf21E152e2D',
    WAULTSWAP_ROUTER_ADDR: '0xD48745E39BbED146eEC15b79cBF964884F9877c2',
    ADD_STRAT_ADDR: '0xeBb8BA21A3703ab30187D3EEC02A3Bc62894970D',
    LIQ_STRAT_ADDR: '0xCAE15b2843A8BAFa65e82b66DFB7D68397085c28',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '6240',
    KILL_FACTOR: '8000',
    MAX_PRICE_DIFF: '11000',
    TIMELOCK: '0x2D5408f2287BF9F9B05404794459a846651D0a59',
    EXACT_ETA: '1622790300',
    STRATS: [
      '0xA7559bB0235a1c6003D0E48d2cFa89a6C8748439',
      '0x853dCB694F74Df5fD28B8fdEC0bE10B8Ac43DCB3'
    ]
  }, {
    WORKER_NAME: "ETH-BUSD Worker",
    VAULT_CONFIG_ADDR: '0xd7b805E88c5F52EDE71a9b93F7048c8d632DBEd4',
    WORKER_CONFIG_ADDR: '0xADaBC5FC5da42c85A84e66096460C769a151A8F8',
    REINVEST_BOT: '0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De',
    POOL_ID: 11,
    VAULT_ADDR: '0x7C9e73d4C71dae564d41F78d56439bB4ba87592f',
    BASE_TOKEN_ADDR: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    WEX_MASTER_ADDR: '0x22fB2663C7ca71Adc2cc99481C77Aaf21E152e2D',
    WAULTSWAP_ROUTER_ADDR: '0xD48745E39BbED146eEC15b79cBF964884F9877c2',
    ADD_STRAT_ADDR: '0xeBb8BA21A3703ab30187D3EEC02A3Bc62894970D',
    LIQ_STRAT_ADDR: '0xCAE15b2843A8BAFa65e82b66DFB7D68397085c28',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8333',
    MAX_PRICE_DIFF: '11000',
    TIMELOCK: '0x2D5408f2287BF9F9B05404794459a846651D0a59',
    EXACT_ETA: '1622790300',
    STRATS: [
      '0x61e58dE669d842C2d77288Df629af031b3283c81',
      '0x853dCB694F74Df5fD28B8fdEC0bE10B8Ac43DCB3'
    ]
  }, {
    WORKER_NAME: "BUSD-ETH Worker",
    VAULT_CONFIG_ADDR: '0x724E6748Cb1d52Ec45b77Fb82a0750A2B759c038',
    WORKER_CONFIG_ADDR: '0xADaBC5FC5da42c85A84e66096460C769a151A8F8',
    REINVEST_BOT: '0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De',
    POOL_ID: 11,
    VAULT_ADDR: '0xbfF4a34A4644a113E8200D7F1D79b3555f723AfE',
    BASE_TOKEN_ADDR: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
    WEX_MASTER_ADDR: '0x22fB2663C7ca71Adc2cc99481C77Aaf21E152e2D',
    WAULTSWAP_ROUTER_ADDR: '0xD48745E39BbED146eEC15b79cBF964884F9877c2',
    ADD_STRAT_ADDR: '0xeBb8BA21A3703ab30187D3EEC02A3Bc62894970D',
    LIQ_STRAT_ADDR: '0xCAE15b2843A8BAFa65e82b66DFB7D68397085c28',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8333',
    MAX_PRICE_DIFF: '11000',
    TIMELOCK: '0x2D5408f2287BF9F9B05404794459a846651D0a59',
    EXACT_ETA: '1622790300',
    STRATS: [
      '0xD58b9626d941cA2d31b55a43045d34A87B32cEd3',
      '0x853dCB694F74Df5fD28B8fdEC0bE10B8Ac43DCB3'
    ]
  }]











  for(let i = 0; i < WORKERS.length; i++) {
    console.log("===================================================================================")
    console.log(`>> Deploying an upgradable WaultSwapWorker contract for ${WORKERS[i].WORKER_NAME}`);
    const WaultSwapWorker = (await ethers.getContractFactory(
      'WaultSwapWorker',
      (await ethers.getSigners())[0]
    )) as WaultSwapWorker__factory;
    const waultSwapWorker = await upgrades.deployProxy(
      WaultSwapWorker,[
        WORKERS[i].VAULT_ADDR,
        WORKERS[i].BASE_TOKEN_ADDR,
        WORKERS[i].WEX_MASTER_ADDR,
        WORKERS[i].WAULTSWAP_ROUTER_ADDR,
        WORKERS[i].POOL_ID,
        WORKERS[i].ADD_STRAT_ADDR,
        WORKERS[i].LIQ_STRAT_ADDR,
        WORKERS[i].REINVEST_BOUNTY_BPS
      ]
    ) as WaultSwapWorker;
    await waultSwapWorker.deployed();
    console.log(`>> Deployed at ${waultSwapWorker.address}`);

    console.log(`>> Adding REINVEST_BOT`);
    await waultSwapWorker.setReinvestorOk([WORKERS[i].REINVEST_BOT], true);
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    await waultSwapWorker.setStrategyOk(WORKERS[i].STRATS, true);
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on strats`);
    const addStrat = WaultSwapRestrictedStrategyAddBaseTokenOnly__factory.connect(WORKERS[i].ADD_STRAT_ADDR, (await ethers.getSigners())[0])
    await addStrat.setWorkersOk([waultSwapWorker.address], true)
    const liqStrat = WaultSwapRestrictedStrategyLiquidate__factory.connect(WORKERS[i].LIQ_STRAT_ADDR, (await ethers.getSigners())[0])
    await liqStrat.setWorkersOk([waultSwapWorker.address], true)
    for(let j = 0; j < WORKERS[i].STRATS.length; j++) {
      const strat = WaultSwapRestrictedStrategyAddBaseTokenOnly__factory.connect(WORKERS[i].STRATS[j], (await ethers.getSigners())[0])
      await strat.setWorkersOk([waultSwapWorker.address], true)
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
          [waultSwapWorker.address], [{acceptDebt: true, workFactor: WORKERS[i].WORK_FACTOR, killFactor: WORKERS[i].KILL_FACTOR, maxPriceDiff: WORKERS[i].MAX_PRICE_DIFF}]
        ]
      ), WORKERS[i].EXACT_ETA
    );
    console.log(`queue setConfigs at: ${setConfigsTx.hash}`)
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i].WORKER_CONFIG_ADDR}', '0', 'setConfigs(address[],(bool,uint64,uint64,uint64)[])', ethers.utils.defaultAbiCoder.encode(['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],[['${waultSwapWorker.address}'], [{acceptDebt: true, workFactor: ${WORKERS[i].WORK_FACTOR}, killFactor: ${WORKERS[i].KILL_FACTOR}, maxPriceDiff: ${WORKERS[i].MAX_PRICE_DIFF}}]]), ${WORKERS[i].EXACT_ETA})`)
    console.log("✅ Done");

    console.log(">> Timelock: Linking VaultConfig with WorkerConfig via Timelock");
    const setWorkersTx = await timelock.queueTransaction(
      WORKERS[i].VAULT_CONFIG_ADDR, '0',
      'setWorkers(address[],address[])',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','address[]'],
        [
          [waultSwapWorker.address], [WORKERS[i].WORKER_CONFIG_ADDR]
        ]
      ), WORKERS[i].EXACT_ETA
    );
    console.log(`queue setWorkers at: ${setWorkersTx.hash}`)
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i].VAULT_CONFIG_ADDR}', '0','setWorkers(address[],address[])', ethers.utils.defaultAbiCoder.encode(['address[]','address[]'],[['${waultSwapWorker.address}'], ['${WORKERS[i].WORKER_CONFIG_ADDR}']]), ${WORKERS[i].EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['WaultSwapWorkers'];