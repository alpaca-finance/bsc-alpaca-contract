import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades, network } from "hardhat";
import {
  CakeMaxiWorker,
  CakeMaxiWorker__factory,
  Timelock__factory,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedSingleAssetStrategyLiquidate__factory,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory,
  PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory,
} from "../../../../../typechain";
import MainnetConfig from "../../../../../.mainnet.json";
import TestnetConfig from "../../../../../.testnet.json";

interface ICakeMaxiWorkerInput {
  VAULT_SYMBOL: string;
  WORKER_NAME: string;
  REINVEST_BOT: string;
  POOL_ID: number;
  BENEFICIAL_VAULT_SYMBOL: string;
  REINVEST_BOUNTY_BPS: string;
  BENEFICIAL_VAULT_BOUNTY_BPS: string;
  WORK_FACTOR: string;
  KILL_FACTOR: string;
  MAX_PRICE_DIFF: string;
  PATH: Array<string>;
  REWARD_PATH: Array<string>;
  EXACT_ETA: string;
}

interface ICakeMaxiWorkerParams {
  WORKER_NAME: string;
  VAULT_CONFIG_ADDR: string;
  WORKER_CONFIG_ADDR: string;
  REINVEST_BOT: string;
  POOL_ID: number;
  VAULT_ADDR: string;
  BASE_TOKEN_ADDR: string;
  MASTER_CHEF_ADDR: string;
  PANCAKESWAP_ROUTER_ADDR: string;
  BENEFICIAL_VAULT: string;
  ADD_STRAT_ADDR: string;
  LIQ_STRAT_ADDR: string;
  ADD_BASE_WITH_FARM_STRAT_ADDR: string;
  MINIMIZE_TRADE_STRAT_ADDR: string;
  REINVEST_BOUNTY_BPS: string;
  BENEFICIAL_VAULT_BOUNTY_BPS: string;
  PATH: Array<string>;
  REWARD_PATH: Array<string>;
  WORK_FACTOR: string;
  KILL_FACTOR: string;
  MAX_PRICE_DIFF: string;
  TIMELOCK: string;
  EXACT_ETA: string;
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
  const shortCakeMaxiWorkerInfo: Array<ICakeMaxiWorkerInput> = [
    {
      VAULT_SYMBOL: "ibBTCB",
      WORKER_NAME: "BTCB CakeMaxiWorker",
      POOL_ID: 0,
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      BENEFICIAL_VAULT_SYMBOL: "ibALPACA",
      REINVEST_BOUNTY_BPS: "1900",
      BENEFICIAL_VAULT_BOUNTY_BPS: "5263",
      WORK_FACTOR: "6240",
      KILL_FACTOR: "8000",
      MAX_PRICE_DIFF: "11000",
      PATH: ["BTCB", "WBNB", "CAKE"],
      REWARD_PATH: ["CAKE", "BUSD", "ALPACA"],
      EXACT_ETA: "1624424400",
    },
  ];

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;
  const workerInfos: ICakeMaxiWorkerParams[] = shortCakeMaxiWorkerInfo.map((n) => {
    const vault = config.Vaults.find((v) => v.symbol === n.VAULT_SYMBOL);
    if (vault === undefined) {
      throw "error: unable to find vault from the given VAULT_SYMBOL";
    }

    const beneficialVault = config.Vaults.find((v) => v.symbol === n.BENEFICIAL_VAULT_SYMBOL);
    if (beneficialVault === undefined) {
      throw "error: unable to find beneficialVault from the given BENEFICIAL_VAULT_SYMBOL";
    }

    const tokenList: any = config.Tokens;
    const path: Array<string> = n.PATH.map((p) => {
      const addr = tokenList[p];
      if (addr === undefined) {
        throw `error: path: unable to find address of ${p}`;
      }
      return addr;
    });

    const rewardPath: Array<string> = n.REWARD_PATH.map((rp) => {
      const addr = tokenList[rp];
      if (addr === undefined) {
        throw `error: reward path: unable to find address of ${rp}`;
      }
      return addr;
    });

    return {
      WORKER_NAME: n.WORKER_NAME,
      VAULT_CONFIG_ADDR: vault.config,
      WORKER_CONFIG_ADDR: config.SharedConfig.PancakeswapSingleAssetWorkerConfig,
      REINVEST_BOT: n.REINVEST_BOT,
      POOL_ID: n.POOL_ID,
      VAULT_ADDR: vault.address,
      BASE_TOKEN_ADDR: vault.baseToken,
      MASTER_CHEF_ADDR: config.YieldSources.Pancakeswap.MasterChef,
      PANCAKESWAP_ROUTER_ADDR: config.YieldSources.Pancakeswap.RouterV2,
      BENEFICIAL_VAULT: beneficialVault.address,
      ADD_STRAT_ADDR: config.SharedStrategies.PancakeswapSingleAsset.StrategyAddBaseTokenOnly,
      LIQ_STRAT_ADDR: config.SharedStrategies.PancakeswapSingleAsset.StrategyLiquidate,
      ADD_BASE_WITH_FARM_STRAT_ADDR: vault.StrategyAddTwoSidesOptimal.PancakeswapSingleAsset,
      MINIMIZE_TRADE_STRAT_ADDR: config.SharedStrategies.PancakeswapSingleAsset.StrategyWithdrawMinimizeTrading,
      REINVEST_BOUNTY_BPS: n.REINVEST_BOUNTY_BPS,
      BENEFICIAL_VAULT_BOUNTY_BPS: n.BENEFICIAL_VAULT_BOUNTY_BPS,
      WORK_FACTOR: n.WORK_FACTOR,
      KILL_FACTOR: n.KILL_FACTOR,
      MAX_PRICE_DIFF: n.MAX_PRICE_DIFF,
      PATH: path,
      REWARD_PATH: rewardPath,
      TIMELOCK: config.Timelock,
      EXACT_ETA: n.EXACT_ETA,
    };
  });

  for (let i = 0; i < workerInfos.length; i++) {
    console.log("===================================================================================");
    console.log(`>> Deploying an upgradable CakeMaxiWorker contract for ${workerInfos[i].WORKER_NAME}`);
    const CakeMaxiWorker = (await ethers.getContractFactory(
      "CakeMaxiWorker",
      (
        await ethers.getSigners()
      )[0]
    )) as CakeMaxiWorker__factory;
    const cakeMaxiWorker = (await upgrades.deployProxy(CakeMaxiWorker, [
      workerInfos[i].VAULT_ADDR,
      workerInfos[i].BASE_TOKEN_ADDR,
      workerInfos[i].MASTER_CHEF_ADDR,
      workerInfos[i].PANCAKESWAP_ROUTER_ADDR,
      workerInfos[i].BENEFICIAL_VAULT,
      workerInfos[i].POOL_ID,
      workerInfos[i].ADD_STRAT_ADDR,
      workerInfos[i].LIQ_STRAT_ADDR,
      workerInfos[i].REINVEST_BOUNTY_BPS,
      workerInfos[i].BENEFICIAL_VAULT_BOUNTY_BPS,
      workerInfos[i].PATH,
      workerInfos[i].REWARD_PATH,
    ])) as CakeMaxiWorker;
    await cakeMaxiWorker.deployed();
    console.log(`>> Deployed at ${cakeMaxiWorker.address}`);

    console.log(`>> Adding REINVEST_BOT`);
    await cakeMaxiWorker.setReinvestorOk([workerInfos[i].REINVEST_BOT], true);
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    await cakeMaxiWorker.setStrategyOk(
      [workerInfos[i].ADD_BASE_WITH_FARM_STRAT_ADDR, workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR],
      true
    );
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on strats`);
    const addStrat = PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory.connect(
      workerInfos[i].ADD_STRAT_ADDR,
      (await ethers.getSigners())[0]
    );
    await addStrat.setWorkersOk([cakeMaxiWorker.address], true);
    const liqStrat = PancakeswapV2RestrictedSingleAssetStrategyLiquidate__factory.connect(
      workerInfos[i].LIQ_STRAT_ADDR,
      (await ethers.getSigners())[0]
    );
    await liqStrat.setWorkersOk([cakeMaxiWorker.address], true);
    const twoSidesStrat = PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory.connect(
      workerInfos[i].ADD_BASE_WITH_FARM_STRAT_ADDR,
      (await ethers.getSigners())[0]
    );
    await twoSidesStrat.setWorkersOk([cakeMaxiWorker.address], true);
    const minimizeStrat = PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory.connect(
      workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
      (await ethers.getSigners())[0]
    );
    await minimizeStrat.setWorkersOk([cakeMaxiWorker.address], true);
    console.log("✅ Done");

    const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

    console.log(">> Timelock: Setting WorkerConfig via Timelock");
    const setConfigsTx = await timelock.queueTransaction(
      workerInfos[i].WORKER_CONFIG_ADDR,
      "0",
      "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
      ethers.utils.defaultAbiCoder.encode(
        ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
        [
          [cakeMaxiWorker.address],
          [
            {
              acceptDebt: true,
              workFactor: workerInfos[i].WORK_FACTOR,
              killFactor: workerInfos[i].KILL_FACTOR,
              maxPriceDiff: workerInfos[i].MAX_PRICE_DIFF,
            },
          ],
        ]
      ),
      workerInfos[i].EXACT_ETA
    );
    console.log(`queue setConfigs at: ${setConfigsTx.hash}`);
    console.log("generate timelock.executeTransaction:");
    console.log(
      `await timelock.executeTransaction('${workerInfos[i].WORKER_CONFIG_ADDR}', '0', 'setConfigs(address[],(bool,uint64,uint64,uint64)[])', ethers.utils.defaultAbiCoder.encode(['address[]','(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]'],[['${cakeMaxiWorker.address}'], [{acceptDebt: true, workFactor: ${workerInfos[i].WORK_FACTOR}, killFactor: ${workerInfos[i].KILL_FACTOR}, maxPriceDiff: ${workerInfos[i].MAX_PRICE_DIFF}}]]), ${workerInfos[i].EXACT_ETA})`
    );
    console.log("✅ Done");

    console.log(">> Timelock: Linking VaultConfig with WorkerConfig via Timelock");
    const setWorkersTx = await timelock.queueTransaction(
      workerInfos[i].VAULT_CONFIG_ADDR,
      "0",
      "setWorkers(address[],address[])",
      ethers.utils.defaultAbiCoder.encode(
        ["address[]", "address[]"],
        [[cakeMaxiWorker.address], [workerInfos[i].WORKER_CONFIG_ADDR]]
      ),
      workerInfos[i].EXACT_ETA
    );
    console.log(`queue setWorkers at: ${setWorkersTx.hash}`);
    console.log("generate timelock.executeTransaction:");
    console.log(
      `await timelock.executeTransaction('${workerInfos[i].VAULT_CONFIG_ADDR}', '0','setWorkers(address[],address[])', ethers.utils.defaultAbiCoder.encode(['address[]','address[]'],[['${cakeMaxiWorker.address}'], ['${workerInfos[i].WORKER_CONFIG_ADDR}']]), ${workerInfos[i].EXACT_ETA})`
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["CakeMaxiWorkers"];
