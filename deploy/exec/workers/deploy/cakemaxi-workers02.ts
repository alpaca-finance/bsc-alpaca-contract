import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades, network } from "hardhat";
import {
  Timelock__factory,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory,
  CakeMaxiWorker02,
  WorkerConfig__factory,
  ConfigurableInterestVaultConfig__factory,
} from "../../../../typechain";
import { TimelockEntity } from "../../../entities";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { UpgradeableContractDeployer } from "../../../deployer";
import { compare } from "../../../../utils/address";
import { fileService, TimelockService } from "../../../services";
import { WorkersEntity } from "../../../interfaces/config";

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
  REINVEST_THRESHOLD: string;
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
  PARTIAL_CLOSE_LIQ_STRAT_ADDR: string;
  PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR: string;
  REINVEST_BOUNTY_BPS: string;
  BENEFICIAL_VAULT_BOUNTY_BPS: string;
  PATH: Array<string>;
  REWARD_PATH: Array<string>;
  REINVEST_THRESHOLD: string;
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
  const executeFileTitle = "cakemaxi-workers02";
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  const shortCakeMaxiWorkerInfo: Array<ICakeMaxiWorkerInput> = [
    {
      VAULT_SYMBOL: "ibUSDC",
      WORKER_NAME: "USDC CakeMaxiWorker",
      POOL_ID: 0,
      REINVEST_BOT: "0xcf28b4da7d3ed29986831876b74af6e95211d3f9",
      BENEFICIAL_VAULT_SYMBOL: "AlpacaFeeder",
      REINVEST_BOUNTY_BPS: "1900",
      BENEFICIAL_VAULT_BOUNTY_BPS: "5263",
      WORK_FACTOR: "6240",
      KILL_FACTOR: "8000",
      MAX_PRICE_DIFF: "10500",
      PATH: ["USDC", "BUSD", "CAKE"],
      REWARD_PATH: ["CAKE", "BUSD", "ALPACA"],
      REINVEST_THRESHOLD: "1",
      EXACT_ETA: "1642493700",
    },
  ];

  const deployer = await getDeployer();

  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  const workerInfos: ICakeMaxiWorkerParams[] = shortCakeMaxiWorkerInfo.map((n) => {
    const vault = config.Vaults.find((v) => v.symbol === n.VAULT_SYMBOL);
    if (vault === undefined) {
      throw `error: unable to find vault from the given ${n.VAULT_SYMBOL}`;
    }

    let beneficialVaultAddress = "";
    if (n.BENEFICIAL_VAULT_SYMBOL === "AlpacaFeeder") {
      beneficialVaultAddress =
        network.name === "mainnet" || network.name === "mainnetfork"
          ? "0x44B3868cbba5fbd2c5D8d1445BDB14458806B3B4"
          : "0x5589FE5BEAe1C642A48eEFF5e80A761343D831a9";
    } else {
      beneficialVaultAddress = config.Vaults.find((v) => v.symbol === n.BENEFICIAL_VAULT_SYMBOL)!.address;
    }

    if (beneficialVaultAddress === "") {
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
      WORKER_CONFIG_ADDR: config.SharedConfig.PancakeswapSingleAssetWorkerConfig!,
      REINVEST_BOT: n.REINVEST_BOT,
      POOL_ID: n.POOL_ID,
      VAULT_ADDR: vault.address,
      BASE_TOKEN_ADDR: vault.baseToken,
      MASTER_CHEF_ADDR: config.YieldSources.Pancakeswap!.MasterChef,
      PANCAKESWAP_ROUTER_ADDR: config.YieldSources.Pancakeswap!.RouterV2,
      BENEFICIAL_VAULT: beneficialVaultAddress,
      ADD_STRAT_ADDR: config.SharedStrategies.PancakeswapSingleAsset!.StrategyAddBaseTokenOnly,
      LIQ_STRAT_ADDR: config.SharedStrategies.PancakeswapSingleAsset!.StrategyLiquidate,
      ADD_BASE_WITH_FARM_STRAT_ADDR: vault.StrategyAddTwoSidesOptimal.PancakeswapSingleAsset!,
      MINIMIZE_TRADE_STRAT_ADDR: config.SharedStrategies.PancakeswapSingleAsset!.StrategyWithdrawMinimizeTrading,
      PARTIAL_CLOSE_LIQ_STRAT_ADDR: config.SharedStrategies.PancakeswapSingleAsset!.StrategyPartialCloseLiquidate,
      PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR:
        config.SharedStrategies.PancakeswapSingleAsset!.StrategyPartialCloseMinimizeTrading,
      REINVEST_BOUNTY_BPS: n.REINVEST_BOUNTY_BPS,
      BENEFICIAL_VAULT_BOUNTY_BPS: n.BENEFICIAL_VAULT_BOUNTY_BPS,
      WORK_FACTOR: n.WORK_FACTOR,
      KILL_FACTOR: n.KILL_FACTOR,
      MAX_PRICE_DIFF: n.MAX_PRICE_DIFF,
      PATH: path,
      REWARD_PATH: rewardPath,
      REINVEST_THRESHOLD: ethers.utils.parseEther(n.REINVEST_THRESHOLD).toString(),
      TIMELOCK: config.Timelock,
      EXACT_ETA: n.EXACT_ETA,
    };
  });

  for (let i = 0; i < workerInfos.length; i++) {
    const contractDeployer = new UpgradeableContractDeployer<CakeMaxiWorker02>(
      deployer,
      "CakeMaxiWorker02",
      workerInfos[i].WORKER_NAME
    );

    const { contract: cakeMaxiWorker02, deployedBlock } = await contractDeployer.deploy([
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
      workerInfos[i].REINVEST_THRESHOLD,
    ]);

    let nonce = await deployer.getTransactionCount();

    console.log(`>> Adding REINVEST_BOT`);
    await cakeMaxiWorker02.setReinvestorOk([workerInfos[i].REINVEST_BOT], true, { nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Set Treasury Account`);
    await cakeMaxiWorker02.setTreasuryConfig(workerInfos[i].REINVEST_BOT, workerInfos[i].REINVEST_BOUNTY_BPS, {
      nonce: nonce++,
    });

    console.log(`>> Adding Strategies`);
    const okStrats = [
      workerInfos[i].ADD_BASE_WITH_FARM_STRAT_ADDR,
      workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR,
    ];
    await cakeMaxiWorker02.setStrategyOk(okStrats, true, { nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on strats`);
    const allOkStrats = [workerInfos[i].ADD_STRAT_ADDR, workerInfos[i].LIQ_STRAT_ADDR, ...okStrats];

    for (const stratAddress of allOkStrats) {
      // NOTE: all PancakeswapV2RestrictedSingleAssetStrategy have the same signature of func setWorkersOk.
      //       then we can use any PancakeswapV2RestrictedSingleAssetStrategy factory for all PancakeswapV2RestrictedSingleAssetStrategy addresses
      const contractFactory = PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory.connect(
        stratAddress,
        deployer
      );
      await contractFactory.setWorkersOk([cakeMaxiWorker02.address], true, { nonce: nonce++ });
    }
    console.log("✅ Done");

    const workerConfig = WorkerConfig__factory.connect(workerInfos[i].WORKER_CONFIG_ADDR, deployer);
    const vaultConfig = ConfigurableInterestVaultConfig__factory.connect(workerInfos[i].VAULT_CONFIG_ADDR, deployer);

    const timelock = Timelock__factory.connect(workerInfos[i].TIMELOCK, deployer);

    const [workerOwnerAddress, vaultOwnerAddress] = await Promise.all([workerConfig.owner(), vaultConfig.owner()]);

    if (compare(workerOwnerAddress, timelock.address)) {
      const setConfigsTx = await TimelockService.queueTransaction(
        `>> Queue tx on Timelock Setting WorkerConfig via Timelock at ${workerInfos[i].WORKER_CONFIG_ADDR} for ${cakeMaxiWorker02.address} ETA ${workerInfos[i].EXACT_ETA}`,
        workerInfos[i].WORKER_CONFIG_ADDR,
        "0",
        "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
        ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
        [
          [cakeMaxiWorker02.address],
          [
            {
              acceptDebt: true,
              workFactor: workerInfos[i].WORK_FACTOR,
              killFactor: workerInfos[i].KILL_FACTOR,
              maxPriceDiff: workerInfos[i].MAX_PRICE_DIFF,
            },
          ],
        ],
        workerInfos[i].EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("15", "gwei"), nonce: nonce++ }
      );
      timelockTransactions.push(setConfigsTx);
      fileService.writeJson(executeFileTitle, timelockTransactions);
      console.log("✅ Done");
    } else {
      console.log(">> Setting WorkerConfig");
      (
        await workerConfig.setConfigs(
          [cakeMaxiWorker02.address],
          [
            {
              acceptDebt: true,
              workFactor: workerInfos[i].WORK_FACTOR,
              killFactor: workerInfos[i].KILL_FACTOR,
              maxPriceDiff: workerInfos[i].MAX_PRICE_DIFF,
            },
          ],
          { nonce: nonce++ }
        )
      ).wait(3);
      console.log("✅ Done");
    }

    if (compare(vaultOwnerAddress, timelock.address)) {
      const setWorkersTx = await TimelockService.queueTransaction(
        `>> Queue tx on Timelock Linking VaultConfig with WorkerConfig via Timelock for ${workerInfos[i].VAULT_CONFIG_ADDR}`,
        workerInfos[i].VAULT_CONFIG_ADDR,
        "0",
        "setWorkers(address[],address[])",
        ["address[]", "address[]"],
        [[cakeMaxiWorker02.address], [workerInfos[i].WORKER_CONFIG_ADDR]],
        workerInfos[i].EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("15", "gwei"), nonce: nonce++ }
      );
      timelockTransactions.push(setWorkersTx);
      fileService.writeJson(executeFileTitle, timelockTransactions);
      console.log("✅ Done");
    } else {
      console.log(">> Linking VaultConfig with WorkerConfig");
      (
        await vaultConfig.setWorkers([cakeMaxiWorker02.address], [workerInfos[i].WORKER_CONFIG_ADDR], {
          nonce: nonce++,
        })
      ).wait(3);
      console.log("✅ Done");
    }

    const lpPoolAddress = config.YieldSources.Pancakeswap!.pools.find(
      (pool) => pool.pId === workerInfos[i].POOL_ID
    )!.address;

    const workersEntity: WorkersEntity = {
      name: workerInfos[i].WORKER_NAME,
      address: cakeMaxiWorker02.address,
      deployedBlock: deployedBlock,
      config: workerInfos[i].WORKER_CONFIG_ADDR,
      pId: workerInfos[i].POOL_ID,
      stakingToken: lpPoolAddress,
      stakingTokenAt: workerInfos[i].MASTER_CHEF_ADDR,
      strategies: {
        StrategyAddAllBaseToken: workerInfos[i].ADD_STRAT_ADDR,
        StrategyLiquidate: workerInfos[i].LIQ_STRAT_ADDR,
        StrategyAddTwoSidesOptimal: workerInfos[i].ADD_BASE_WITH_FARM_STRAT_ADDR,
        StrategyWithdrawMinimizeTrading: workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
        StrategyPartialCloseLiquidate: workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR,
        StrategyPartialCloseMinimizeTrading: workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR,
      },
    };

    config = configFileHelper.addOrSetVaultWorker(workerInfos[i].VAULT_ADDR, workersEntity);
  }
};

export default func;
func.tags = ["CakeMaxiWorkers02"];
