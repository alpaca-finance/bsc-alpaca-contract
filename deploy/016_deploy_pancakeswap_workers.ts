import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  PancakeswapWorker,
  PancakeswapWorker__factory,
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
    WORKER_NAME: "COMP-ETH Worker",
    VAULT_CONFIG_ADDR: '0x724E6748Cb1d52Ec45b77Fb82a0750A2B759c038',
    WORKER_CONFIG_ADDR: '0xADaBC5FC5da42c85A84e66096460C769a151A8F8',
    REINVEST_BOT: '0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De',
    POOL_ID: 72,
    VAULT_ADDR: '0xbfF4a34A4644a113E8200D7F1D79b3555f723AfE',
    BASE_TOKEN_ADDR: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
    MASTER_CHEF_ADDR: '0x73feaa1eE314F8c655E354234017bE2193C9E24E',
    PANCAKESWAP_ROUTER_ADDR: '0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F',
    ADD_STRAT_ADDR: '0x1DBa79e73a7Ea9749fc28B921bc9431D09BEf2B5',
    LIQ_STRAT_ADDR: '0xc7c025aA69F4b525E3F9f5186b524492ee1C86bB',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8333',
    MAX_PRICE_DIFF: '11000',
    TIMELOCK: '0x2D5408f2287BF9F9B05404794459a846651D0a59',
    EXACT_ETA: '1617775200',
    STRATS: [
      '0xEb6e0B9839b297322a6FaEc0cEBC6d3e207b7480',
      '0x5e2911d70d7a659Da0dA26989F445aeCAC58f2E6'
    ]
  }, {
    WORKER_NAME: "SUSHI-ETH Worker",
    VAULT_CONFIG_ADDR: '0x724E6748Cb1d52Ec45b77Fb82a0750A2B759c038',
    WORKER_CONFIG_ADDR: '0xADaBC5FC5da42c85A84e66096460C769a151A8F8',
    REINVEST_BOT: '0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De',
    POOL_ID: 78,
    VAULT_ADDR: '0xbfF4a34A4644a113E8200D7F1D79b3555f723AfE',
    BASE_TOKEN_ADDR: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
    MASTER_CHEF_ADDR: '0x73feaa1eE314F8c655E354234017bE2193C9E24E',
    PANCAKESWAP_ROUTER_ADDR: '0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F',
    ADD_STRAT_ADDR: '0x1DBa79e73a7Ea9749fc28B921bc9431D09BEf2B5',
    LIQ_STRAT_ADDR: '0xc7c025aA69F4b525E3F9f5186b524492ee1C86bB',
    REINVEST_BOUNTY_BPS: '300',
    WORK_FACTOR: '7000',
    KILL_FACTOR: '8333',
    MAX_PRICE_DIFF: '11000',
    TIMELOCK: '0x2D5408f2287BF9F9B05404794459a846651D0a59',
    EXACT_ETA: '1617775200',
    STRATS: [
      '0xEb6e0B9839b297322a6FaEc0cEBC6d3e207b7480',
      '0x5e2911d70d7a659Da0dA26989F445aeCAC58f2E6'
    ]
  }]









  for(let i = 0; i < WORKERS.length; i++) {
    console.log("===================================================================================")
    console.log(`>> Deploying an upgradable PancakeswapWorker contract for ${WORKERS[i].WORKER_NAME}`);
    const PancakeswapWorker = (await ethers.getContractFactory(
      'PancakeswapWorker',
      (await ethers.getSigners())[0]
    )) as PancakeswapWorker__factory;
    const pancakeswapWorker = await upgrades.deployProxy(
      PancakeswapWorker,[
        WORKERS[i].VAULT_ADDR, WORKERS[i].BASE_TOKEN_ADDR, WORKERS[i].MASTER_CHEF_ADDR,
        WORKERS[i].PANCAKESWAP_ROUTER_ADDR, WORKERS[i].POOL_ID, WORKERS[i].ADD_STRAT_ADDR,
        WORKERS[i].LIQ_STRAT_ADDR, WORKERS[i].REINVEST_BOUNTY_BPS
      ]
    ) as PancakeswapWorker;
    await pancakeswapWorker.deployed();
    console.log(`>> Deployed at ${pancakeswapWorker.address}`);

    console.log(`>> Adding REINVEST_BOT`);
    await pancakeswapWorker.setReinvestorOk([WORKERS[i].REINVEST_BOT], true);
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    await pancakeswapWorker.setStrategyOk(WORKERS[i].STRATS, true);
    console.log("✅ Done");

    const timelock = Timelock__factory.connect(WORKERS[i].TIMELOCK, (await ethers.getSigners())[0]);

    console.log(">> Timelock: Setting WorkerConfig via Timelock");
    await timelock.queueTransaction(
      WORKERS[i].WORKER_CONFIG_ADDR, '0',
      'setConfigs(address[],(bool,uint64,uint64,uint64)[])',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],
        [
          [pancakeswapWorker.address], [{acceptDebt: true, workFactor: WORKERS[i].WORK_FACTOR, killFactor: WORKERS[i].KILL_FACTOR, maxPriceDiff: WORKERS[i].MAX_PRICE_DIFF}]
        ]
      ), WORKERS[i].EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i].WORKER_CONFIG_ADDR}', '0', 'setConfigs(address[],(bool,uint64,uint64,uint64)[])', ethers.utils.defaultAbiCoder.encode(['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],[['${pancakeswapWorker.address}'], [{acceptDebt: true, workFactor: ${WORKERS[i].WORK_FACTOR}, killFactor: ${WORKERS[i].KILL_FACTOR}, maxPriceDiff: ${WORKERS[i].MAX_PRICE_DIFF}}]]), ${WORKERS[i].EXACT_ETA})`)
    console.log("✅ Done");

    console.log(">> Timelock: Linking VaultConfig with WorkerConfig via Timelock");
    await timelock.queueTransaction(
      WORKERS[i].VAULT_CONFIG_ADDR, '0',
      'setWorkers(address[],address[])',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','address[]'],
        [
          [pancakeswapWorker.address], [WORKERS[i].WORKER_CONFIG_ADDR]
        ]
      ), WORKERS[i].EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i].VAULT_CONFIG_ADDR}', '0','setWorkers(address[],address[])', ethers.utils.defaultAbiCoder.encode(['address[]','address[]'],[['${pancakeswapWorker.address}'], ['${WORKERS[i].WORKER_CONFIG_ADDR}']]), ${WORKERS[i].EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['PancakeswapWorkers'];