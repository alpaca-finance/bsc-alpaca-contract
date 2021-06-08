import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
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
  BENEFICIAL_VAULT: string
  ADD_STRAT_ADDR: string
  LIQ_STRAT_ADDR: string
  REINVEST_BOUNTY_BPS: string
  BENEFICIAL_VAULT_BOUNTY_BPS: string
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
    WORKER_NAME: "ETH CakeMaxiWorker",
    VAULT_CONFIG_ADDR: '0x6Eebe002C224490A800eFC6BC3f1B28816Bf6164',
    WORKER_CONFIG_ADDR: '0xB3A73ceA38Bf48d7579F25d7fb7F79d33f81650e',
    REINVEST_BOT: '0xcf28b4da7d3ed29986831876b74af6e95211d3f9',
    POOL_ID: 0,
    VAULT_ADDR: '0x3F1D4A430C213bd9D4c9a12E4F382270505fCeA1',
    BASE_TOKEN_ADDR: '0xd5c082df9eDE041548fa79e05A1CB077036ca86F',
    MASTER_CHEF_ADDR: '0xbCC50b0B0AFD19Ee83a6E79e6c01D51b16090A0B',
    PANCAKESWAP_ROUTER_ADDR: '0x367633909278A3C91f4cB130D8e56382F00D1071',
    BENEFICIAL_VAULT: '0x6ad3A0d891C59677fbbB22E071613253467C382A',
    ADD_STRAT_ADDR: '0xE331932D8599c256328B3C649135AC8bfB0Fa5B5',
    LIQ_STRAT_ADDR: '0xfA36a6135433e971AD66BA0032f76c8E43Ac1005',
    REINVEST_BOUNTY_BPS: '1900',
    BENEFICIAL_VAULT_BOUNTY_BPS: '5263',
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8333',
    MAX_PRICE_DIFF: '110000000000',
    TIMELOCK: '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337',
    EXACT_ETA: '1623154500',
    STRATS: [
      '0x4f16fBeA98a33E333AB8Cecf5bD05cD7E58AbA4D',
      '0x6C12b05F9235cf0D92B152F47bcB6947B927591e'
    ]
  }, {
    WORKER_NAME: "USDT CakeMaxiWorker",
    VAULT_CONFIG_ADDR: '0x4155538832c1937832b9db279CEEA61Bbae5eF96',
    WORKER_CONFIG_ADDR: '0xB3A73ceA38Bf48d7579F25d7fb7F79d33f81650e',
    REINVEST_BOT: '0xcf28b4da7d3ed29986831876b74af6e95211d3f9',
    POOL_ID: 0,
    VAULT_ADDR: '0xb5913CD4C508f07025678CeF939BcC54D3024C39',
    BASE_TOKEN_ADDR: '0xE60Fa777dEb72C364447BB18C823C4731FbeD671',
    MASTER_CHEF_ADDR: '0xbCC50b0B0AFD19Ee83a6E79e6c01D51b16090A0B',
    PANCAKESWAP_ROUTER_ADDR: '0x367633909278A3C91f4cB130D8e56382F00D1071',
    BENEFICIAL_VAULT: '0x6ad3A0d891C59677fbbB22E071613253467C382A',
    ADD_STRAT_ADDR: '0xE331932D8599c256328B3C649135AC8bfB0Fa5B5',
    LIQ_STRAT_ADDR: '0xfA36a6135433e971AD66BA0032f76c8E43Ac1005',
    REINVEST_BOUNTY_BPS: '1900',
    BENEFICIAL_VAULT_BOUNTY_BPS: '5263',
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8333',
    MAX_PRICE_DIFF: '110000000000',
    TIMELOCK: '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337',
    EXACT_ETA: '1623154500',
    STRATS: [
      '0x7A7553B7e46680eae3B97f396150b616401B9d6D',
      '0x6C12b05F9235cf0D92B152F47bcB6947B927591e'
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
        WORKERS[i].PANCAKESWAP_ROUTER_ADDR, WORKERS[i].BENEFICIAL_VAULT, WORKERS[i].POOL_ID, WORKERS[i].ADD_STRAT_ADDR,
        WORKERS[i].LIQ_STRAT_ADDR, WORKERS[i].REINVEST_BOUNTY_BPS, WORKERS[i].BENEFICIAL_VAULT_BOUNTY_BPS
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