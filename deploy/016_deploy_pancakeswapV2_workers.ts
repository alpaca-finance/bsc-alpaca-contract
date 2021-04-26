import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
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
    WORKER_NAME: "BUSD-ALPACA Worker",
    VAULT_CONFIG_ADDR: '0x06d0c5B027C8e1BFce561B8af34B87A2A3Ff005d',
    WORKER_CONFIG_ADDR: '0x8ae5e14864090E9332Ceb238F7cEa183d7C056a7',
    REINVEST_BOT: '0xcf28b4da7d3ed29986831876b74af6e95211d3f9',
    POOL_ID: 39,
    VAULT_ADDR: '0x6ad3A0d891C59677fbbB22E071613253467C382A',
    BASE_TOKEN_ADDR: '0x354b3a11D5Ea2DA89405173977E271F58bE2897D',
    MASTER_CHEF_ADDR: '0xbCC50b0B0AFD19Ee83a6E79e6c01D51b16090A0B',
    PANCAKESWAP_ROUTER_ADDR: '0x367633909278A3C91f4cB130D8e56382F00D1071',
    ADD_STRAT_ADDR: '0x11aFF2AC27CBb158015fb3F8FD7661F7f8573BD7',
    LIQ_STRAT_ADDR: '0x4f960E01a7c118BCeb699F81FD36732BaB6Df1Ef',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '5200',
    KILL_FACTOR: '7000',
    MAX_PRICE_DIFF: '13000',
    TIMELOCK: '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337',
    EXACT_ETA: '1619415000',
    STRATS: [
      '0xD0F4b5A6Cd5886032cCA617Db983DDB0e3f69CEb',
      '0x1757f0F5cBa364AF5556Fa147D413a2Cc8fa3511'
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

    const timelock = Timelock__factory.connect(WORKERS[i].TIMELOCK, (await ethers.getSigners())[0]);

    console.log(">> Timelock: Setting WorkerConfig via Timelock");
    await timelock.queueTransaction(
      WORKERS[i].WORKER_CONFIG_ADDR, '0',
      'setConfigs(address[],(bool,uint64,uint64,uint64)[])',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],
        [
          [pancakeswapV2Worker.address], [{acceptDebt: true, workFactor: WORKERS[i].WORK_FACTOR, killFactor: WORKERS[i].KILL_FACTOR, maxPriceDiff: WORKERS[i].MAX_PRICE_DIFF}]
        ]
      ), WORKERS[i].EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i].WORKER_CONFIG_ADDR}', '0', 'setConfigs(address[],(bool,uint64,uint64,uint64)[])', ethers.utils.defaultAbiCoder.encode(['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],[['${pancakeswapV2Worker.address}'], [{acceptDebt: true, workFactor: ${WORKERS[i].WORK_FACTOR}, killFactor: ${WORKERS[i].KILL_FACTOR}, maxPriceDiff: ${WORKERS[i].MAX_PRICE_DIFF}}]]), ${WORKERS[i].EXACT_ETA})`)
    console.log("✅ Done");

    console.log(">> Timelock: Linking VaultConfig with WorkerConfig via Timelock");
    await timelock.queueTransaction(
      WORKERS[i].VAULT_CONFIG_ADDR, '0',
      'setWorkers(address[],address[])',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','address[]'],
        [
          [pancakeswapV2Worker.address], [WORKERS[i].WORKER_CONFIG_ADDR]
        ]
      ), WORKERS[i].EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i].VAULT_CONFIG_ADDR}', '0','setWorkers(address[],address[])', ethers.utils.defaultAbiCoder.encode(['address[]','address[]'],[['${pancakeswapV2Worker.address}'], ['${WORKERS[i].WORKER_CONFIG_ADDR}']]), ${WORKERS[i].EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['PancakeswapWorkers'];