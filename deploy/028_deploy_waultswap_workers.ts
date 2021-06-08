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
    WORKER_NAME: "WEX-USDT Worker",
    VAULT_CONFIG_ADDR: '0x4155538832c1937832b9db279CEEA61Bbae5eF96',
    WORKER_CONFIG_ADDR: '0x8ae5e14864090E9332Ceb238F7cEa183d7C056a7',
    REINVEST_BOT: '0xcf28b4da7d3ed29986831876b74af6e95211d3f9',
    POOL_ID: 3,
    VAULT_ADDR: '0xb5913CD4C508f07025678CeF939BcC54D3024C39',
    BASE_TOKEN_ADDR: '0xE60Fa777dEb72C364447BB18C823C4731FbeD671',
    WEX_MASTER_ADDR: '0x85F6A87A056313Fd1717937Cf3cC7BCe3e3445D1',
    WAULTSWAP_ROUTER_ADDR: '0xA0bC344E20d89ccA131f869E059499F41d7a13D3',
    ADD_STRAT_ADDR: '0xD15DBC544ad55d4877cAd426a6e6e16446a012b5',
    LIQ_STRAT_ADDR: '0xdbcDcd7bE24d0dbf2b167F14435945EC7e0F454A',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '6240',
    KILL_FACTOR: '8000',
    MAX_PRICE_DIFF: '11000000000',
    TIMELOCK: '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337',
    EXACT_ETA: '1623066000',
    STRATS: [
      '0x48393b82Abac4Fbb807A927E60008eFaf5f79Cf7',
      '0xE5909854177a493BFeF616e2E142211413aC295d'
    ]
  }, {
    WORKER_NAME: "BTCB-ETH Worker",
    VAULT_CONFIG_ADDR: '0x6Eebe002C224490A800eFC6BC3f1B28816Bf6164',
    WORKER_CONFIG_ADDR: '0x8ae5e14864090E9332Ceb238F7cEa183d7C056a7',
    REINVEST_BOT: '0xcf28b4da7d3ed29986831876b74af6e95211d3f9',
    POOL_ID: 4,
    VAULT_ADDR: '0x3F1D4A430C213bd9D4c9a12E4F382270505fCeA1',
    BASE_TOKEN_ADDR: '0xd5c082df9eDE041548fa79e05A1CB077036ca86F',
    WEX_MASTER_ADDR: '0x85F6A87A056313Fd1717937Cf3cC7BCe3e3445D1',
    WAULTSWAP_ROUTER_ADDR: '0xA0bC344E20d89ccA131f869E059499F41d7a13D3',
    ADD_STRAT_ADDR: '0xD15DBC544ad55d4877cAd426a6e6e16446a012b5',
    LIQ_STRAT_ADDR: '0xdbcDcd7bE24d0dbf2b167F14435945EC7e0F454A',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8333',
    MAX_PRICE_DIFF: '11000000000',
    TIMELOCK: '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337',
    EXACT_ETA: '1623066000',
    STRATS: [
      '0xeBfda6D0232335a067aE6a3e5E470D8cDcb22f53',
      '0xE5909854177a493BFeF616e2E142211413aC295d'
    ]
  }, {
    WORKER_NAME: "ETH-BTCB Worker",
    VAULT_CONFIG_ADDR: '0x442545909DB59E658ADC9a79430Ea3aEDBDfee5B',
    WORKER_CONFIG_ADDR: '0x8ae5e14864090E9332Ceb238F7cEa183d7C056a7',
    REINVEST_BOT: '0xcf28b4da7d3ed29986831876b74af6e95211d3f9',
    POOL_ID: 4,
    VAULT_ADDR: '0xB8Eca31D1862B6330E376fA795609056c7421EB0',
    BASE_TOKEN_ADDR: '0xCCaf3FC49B0D0F53fe2c08103F75A397052983FB',
    WEX_MASTER_ADDR: '0x85F6A87A056313Fd1717937Cf3cC7BCe3e3445D1',
    WAULTSWAP_ROUTER_ADDR: '0xA0bC344E20d89ccA131f869E059499F41d7a13D3',
    ADD_STRAT_ADDR: '0xD15DBC544ad55d4877cAd426a6e6e16446a012b5',
    LIQ_STRAT_ADDR: '0xdbcDcd7bE24d0dbf2b167F14435945EC7e0F454A',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8333',
    MAX_PRICE_DIFF: '11000000000',
    TIMELOCK: '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337',
    EXACT_ETA: '1623066000',
    STRATS: [
      '0x29a8B6f3c9F79314a82f3092EA065F9f15371dB8',
      '0xE5909854177a493BFeF616e2E142211413aC295d'
    ]
  }, {
    WORKER_NAME: "BNB-BUSD Worker",
    VAULT_CONFIG_ADDR: '0xbC6d2dfe97A557Bd793d07ebB0df3ea80cc990Fc',
    WORKER_CONFIG_ADDR: '0x8ae5e14864090E9332Ceb238F7cEa183d7C056a7',
    REINVEST_BOT: '0xcf28b4da7d3ed29986831876b74af6e95211d3f9',
    POOL_ID: 5,
    VAULT_ADDR: '0xe5ed8148fE4915cE857FC648b9BdEF8Bb9491Fa5',
    BASE_TOKEN_ADDR: '0x0266693F9Df932aD7dA8a9b44C2129Ce8a87E81f',
    WEX_MASTER_ADDR: '0x85F6A87A056313Fd1717937Cf3cC7BCe3e3445D1',
    WAULTSWAP_ROUTER_ADDR: '0xA0bC344E20d89ccA131f869E059499F41d7a13D3',
    ADD_STRAT_ADDR: '0xD15DBC544ad55d4877cAd426a6e6e16446a012b5',
    LIQ_STRAT_ADDR: '0xdbcDcd7bE24d0dbf2b167F14435945EC7e0F454A',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8333',
    MAX_PRICE_DIFF: '11000000000',
    TIMELOCK: '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337',
    EXACT_ETA: '1623066000',
    STRATS: [
      '0xFfA12222e3ccEF58684Af20aaa4D5bf13c8faC10',
      '0xE5909854177a493BFeF616e2E142211413aC295d'
    ]
  }, {
    WORKER_NAME: "BUSD-BNB Worker",
    VAULT_CONFIG_ADDR: '0x037F4b0d074B83d075EC3B955F69BaB9977bdb05',
    WORKER_CONFIG_ADDR: '0x8ae5e14864090E9332Ceb238F7cEa183d7C056a7',
    REINVEST_BOT: '0xcf28b4da7d3ed29986831876b74af6e95211d3f9',
    POOL_ID: 5,
    VAULT_ADDR: '0xf9d32C5E10Dd51511894b360e6bD39D7573450F9',
    BASE_TOKEN_ADDR: '0xDfb1211E2694193df5765d54350e1145FD2404A1',
    WEX_MASTER_ADDR: '0x85F6A87A056313Fd1717937Cf3cC7BCe3e3445D1',
    WAULTSWAP_ROUTER_ADDR: '0xA0bC344E20d89ccA131f869E059499F41d7a13D3',
    ADD_STRAT_ADDR: '0xD15DBC544ad55d4877cAd426a6e6e16446a012b5',
    LIQ_STRAT_ADDR: '0xdbcDcd7bE24d0dbf2b167F14435945EC7e0F454A',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8333',
    MAX_PRICE_DIFF: '11000000000',
    TIMELOCK: '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337',
    EXACT_ETA: '1623066000',
    STRATS: [
      '0xC01390eea9A7e27199e03dA5053C2dd63A5169ff',
      '0xE5909854177a493BFeF616e2E142211413aC295d'
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