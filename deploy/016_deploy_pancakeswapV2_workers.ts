import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyLiquidate__factory,
  PancakeswapV2Worker,
  PancakeswapV2Worker__factory,
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
    WORKER_NAME: "BRY-WBNB Worker",
    VAULT_CONFIG_ADDR: '0x037F4b0d074B83d075EC3B955F69BaB9977bdb05',
    WORKER_CONFIG_ADDR: '0x8ae5e14864090E9332Ceb238F7cEa183d7C056a7',
    REINVEST_BOT: '0xcf28b4da7d3ed29986831876b74af6e95211d3f9',
    POOL_ID: 44,
    VAULT_ADDR: '0xf9d32C5E10Dd51511894b360e6bD39D7573450F9',
    BASE_TOKEN_ADDR: '0xDfb1211E2694193df5765d54350e1145FD2404A1',
    MASTER_CHEF_ADDR: '0xbCC50b0B0AFD19Ee83a6E79e6c01D51b16090A0B',
    PANCAKESWAP_ROUTER_ADDR: '0x367633909278A3C91f4cB130D8e56382F00D1071',
    ADD_STRAT_ADDR: '0x2943b6fC64bDF5bD26E9DFeB9b35d1DBcbdE936C',
    LIQ_STRAT_ADDR: '0x58Bbb507248635413172Ed7A2eeC048402C6b39b',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '4500',
    KILL_FACTOR: '7000',
    MAX_PRICE_DIFF: '11000',
    TIMELOCK: '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337',
    EXACT_ETA: '1620646800',
    STRATS: [
      '0x0A5515aEdc275b9fF19d11Cd74465e83067f6D40',
      '0xD8196dc675E92021aC40d42a8cF437789CD1aC32'
    ]
  }]









  for(let i = 0; i < WORKERS.length; i++) {
    console.log("===================================================================================")
    console.log(`>> Deploying an upgradable PancakeswapV2Worker contract for ${WORKERS[i].WORKER_NAME}`);
    const PancakeswapV2Worker = (await ethers.getContractFactory(
      'PancakeswapV2Worker',
      (await ethers.getSigners())[0]
    )) as PancakeswapV2Worker__factory;
    const pancakeswapV2Worker = await upgrades.deployProxy(
      PancakeswapV2Worker,[
        WORKERS[i].VAULT_ADDR, WORKERS[i].BASE_TOKEN_ADDR, WORKERS[i].MASTER_CHEF_ADDR,
        WORKERS[i].PANCAKESWAP_ROUTER_ADDR, WORKERS[i].POOL_ID, WORKERS[i].ADD_STRAT_ADDR,
        WORKERS[i].LIQ_STRAT_ADDR, WORKERS[i].REINVEST_BOUNTY_BPS
      ]
    ) as PancakeswapV2Worker;
    await pancakeswapV2Worker.deployed();
    console.log(`>> Deployed at ${pancakeswapV2Worker.address}`);

    console.log(`>> Adding REINVEST_BOT`);
    await pancakeswapV2Worker.setReinvestorOk([WORKERS[i].REINVEST_BOT], true);
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    await pancakeswapV2Worker.setStrategyOk(WORKERS[i].STRATS, true);
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on strats`);
    const addStrat = PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory.connect(WORKERS[i].ADD_STRAT_ADDR, (await ethers.getSigners())[0])
    await addStrat.setWorkersOk([pancakeswapV2Worker.address], true)
    const liqStrat = PancakeswapV2RestrictedStrategyLiquidate__factory.connect(WORKERS[i].LIQ_STRAT_ADDR, (await ethers.getSigners())[0])
    await liqStrat.setWorkersOk([pancakeswapV2Worker.address], true)
    for(let j = 0; j < WORKERS[i].STRATS.length; j++) {
      const strat = PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory.connect(WORKERS[i].STRATS[j], (await ethers.getSigners())[0])
      await strat.setWorkersOk([pancakeswapV2Worker.address], true)
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
          [pancakeswapV2Worker.address], [{acceptDebt: true, workFactor: WORKERS[i].WORK_FACTOR, killFactor: WORKERS[i].KILL_FACTOR, maxPriceDiff: WORKERS[i].MAX_PRICE_DIFF}]
        ]
      ), WORKERS[i].EXACT_ETA
    );
    console.log(`queue setConfigs at: ${setConfigsTx.hash}`)
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i].WORKER_CONFIG_ADDR}', '0', 'setConfigs(address[],(bool,uint64,uint64,uint64)[])', ethers.utils.defaultAbiCoder.encode(['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],[['${pancakeswapV2Worker.address}'], [{acceptDebt: true, workFactor: ${WORKERS[i].WORK_FACTOR}, killFactor: ${WORKERS[i].KILL_FACTOR}, maxPriceDiff: ${WORKERS[i].MAX_PRICE_DIFF}}]]), ${WORKERS[i].EXACT_ETA})`)
    console.log("✅ Done");

    console.log(">> Timelock: Linking VaultConfig with WorkerConfig via Timelock");
    const setWorkersTx = await timelock.queueTransaction(
      WORKERS[i].VAULT_CONFIG_ADDR, '0',
      'setWorkers(address[],address[])',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','address[]'],
        [
          [pancakeswapV2Worker.address], [WORKERS[i].WORKER_CONFIG_ADDR]
        ]
      ), WORKERS[i].EXACT_ETA
    );
    console.log(`queue setWorkers at: ${setWorkersTx.hash}`)
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i].VAULT_CONFIG_ADDR}', '0','setWorkers(address[],address[])', ethers.utils.defaultAbiCoder.encode(['address[]','address[]'],[['${pancakeswapV2Worker.address}'], ['${WORKERS[i].WORKER_CONFIG_ADDR}']]), ${WORKERS[i].EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['PancakeswapWorkers'];