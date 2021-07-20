import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  PancakeswapWorker,
  PancakeswapWorker__factory,
  Timelock__factory,
} from '../../../../../typechain';

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

  const VAULT_CONFIG_ADDR = '0xd7b805E88c5F52EDE71a9b93F7048c8d632DBEd4';
  const WORKER_CONFIG_ADDR = '0xADaBC5FC5da42c85A84e66096460C769a151A8F8';

  const REINVEST_BOT = '0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De';

  const WORKER_NAME = "UST-BUSD Worker"
  const POOL_ID = 63;
  const VAULT_ADDR = '0x7C9e73d4C71dae564d41F78d56439bB4ba87592f'
  const BASE_TOKEN_ADDR = '0xe9e7cea3dedca5984780bafc599bd69add087d56'
  const MASTER_CHEF_ADDR = '0x73feaa1eE314F8c655E354234017bE2193C9E24E'
  const PANCAKESWAP_ROUTER_ADDR = '0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F';
  const ADD_STRAT_ADDR = '0x1DBa79e73a7Ea9749fc28B921bc9431D09BEf2B5';
  const LIQ_STRAT_ADDR = '0xc7c025aA69F4b525E3F9f5186b524492ee1C86bB';
  const REINVEST_BOUNTY_BPS = '300';
  const WORK_FACTOR = '7800';
  const KILL_FACTOR = '9000';
  const MAX_PRICE_DIFF = '11000';

  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1617278400';









  console.log(`>> Deploying an upgradable PancakeswapWorker contract for ${WORKER_NAME}`);
  const PancakeswapWorker = (await ethers.getContractFactory(
    'PancakeswapWorker',
    (await ethers.getSigners())[0]
  )) as PancakeswapWorker__factory;
  const pancakeswapWorker = await upgrades.deployProxy(
    PancakeswapWorker,[
      VAULT_ADDR, BASE_TOKEN_ADDR, MASTER_CHEF_ADDR,
      PANCAKESWAP_ROUTER_ADDR, POOL_ID, ADD_STRAT_ADDR,
      LIQ_STRAT_ADDR, REINVEST_BOUNTY_BPS
    ]
  ) as PancakeswapWorker;
  await pancakeswapWorker.deployed();
  console.log(`>> Deployed at ${pancakeswapWorker.address}`);

  console.log(`>> Adding REINVEST_BOT`);
  await pancakeswapWorker.setReinvestorOk([REINVEST_BOT], true);
  console.log("✅ Done");

  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  console.log(">> Timelock: Setting WorkerConfig via Timelock");
  await timelock.queueTransaction(
    WORKER_CONFIG_ADDR, '0',
    'setConfigs(address[],(bool,uint64,uint64,uint64)[])',
    ethers.utils.defaultAbiCoder.encode(
      ['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],
      [
        [pancakeswapWorker.address], [{acceptDebt: true, workFactor: WORK_FACTOR, killFactor: KILL_FACTOR, maxPriceDiff: MAX_PRICE_DIFF}]
      ]
    ), EXACT_ETA
  );
  console.log("generate timelock.executeTransaction:")
  console.log(`await timelock.executeTransaction('${WORKER_CONFIG_ADDR}', '0', 'setConfigs(address[],(bool,uint64,uint64,uint64)[])', ethers.utils.defaultAbiCoder.encode(['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],[['${pancakeswapWorker.address}'], [{acceptDebt: true, workFactor: ${WORK_FACTOR}, killFactor: ${KILL_FACTOR}, maxPriceDiff: ${MAX_PRICE_DIFF}}]]), ${EXACT_ETA})`)
  console.log("✅ Done");

  console.log(">> Timelock: Linking VaultConfig with WorkerConfig via Timelock");
  await timelock.queueTransaction(
    VAULT_CONFIG_ADDR, '0',
    'setWorkers(address[],address[])',
    ethers.utils.defaultAbiCoder.encode(
      ['address[]','address[]'],
      [
        [pancakeswapWorker.address], [WORKER_CONFIG_ADDR]
      ]
    ), EXACT_ETA
  );
  console.log("generate timelock.executeTransaction:")
  console.log(`await timelock.executeTransaction('${VAULT_CONFIG_ADDR}', '0','setWorkers(address[],address[])', ethers.utils.defaultAbiCoder.encode(['address[]','address[]'],[['${pancakeswapWorker.address}'], ['${WORKER_CONFIG_ADDR}']]), ${EXACT_ETA})`)
  console.log("✅ Done");
};

export default func;
func.tags = ['PancakeswapWorker'];