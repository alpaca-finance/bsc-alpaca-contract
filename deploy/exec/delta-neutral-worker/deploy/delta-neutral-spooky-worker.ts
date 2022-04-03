import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network, upgrades } from "hardhat";
import {
  ConfigurableInterestVaultConfig__factory,
  DeltaNeutralSpookyWorker03,
  DeltaNeutralSpookyWorker03__factory,
  SpookySwapStrategyAddBaseTokenOnly__factory,
  SpookySwapStrategyAddTwoSidesOptimal__factory,
  SpookySwapStrategyLiquidate__factory,
  SpookySwapStrategyPartialCloseLiquidate__factory,
  SpookySwapStrategyPartialCloseMinimizeTrading__factory,
  SpookySwapStrategyWithdrawMinimizeTrading__factory,
  SpookyWorker03__factory,
  WorkerConfig__factory,
} from "../../../../typechain";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";
import { BlockScanGasPrice } from "../../../services/gas-price/blockscan";
import { getDeployer } from "../../../../utils/deployer-helper";
import { compare } from "../../../../utils/address";

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

  interface IDeltaNeutralWorkerInput {
    VAULT_SYMBOL: string;
    WORKER_NAME: string;
    TREASURY_ADDRESS: string;
    REINVEST_BOT: string;
    POOL_ID: number;
    REINVEST_BOUNTY_BPS: string;
    REINVEST_PATH: Array<string>;
    REINVEST_THRESHOLD: string;
    WORK_FACTOR: string;
    KILL_FACTOR: string;
    MAX_PRICE_DIFF: string;
    BENEFICIAL_VAULT: string;
    BENEFICIAL_VAULT_BOUNTY_BPS: string;
    BENEFICIAL_REWARD_PATH: Array<string>;
  }

  interface IDeltaNeutralWorkerInfo {
    WORKER_NAME: string;
    VAULT_CONFIG_ADDR: string;
    WORKER_CONFIG_ADDR: string;
    REINVEST_BOT: string;
    POOL_ID: number;
    VAULT_ADDR: string;
    BASE_TOKEN_ADDR: string;
    DELTA_NEUTRAL_ORACLE: string;
    MASTER_CHEF: string;
    ROUTER_ADDR: string;
    ADD_STRAT_ADDR: string;
    LIQ_STRAT_ADDR: string;
    TWO_SIDES_STRAT_ADDR: string;
    PARTIAL_CLOSE_LIQ_STRAT_ADDR: string;
    PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR: string;
    MINIMIZE_TRADE_STRAT_ADDR: string;
    REINVEST_BOUNTY_BPS: string;
    REINVEST_PATH: Array<string>;
    REINVEST_THRESHOLD: string;
    WORK_FACTOR: string;
    KILL_FACTOR: string;
    MAX_PRICE_DIFF: string;
    TIMELOCK: string;
    BENEFICIAL_VAULT: string;
    BENEFICIAL_VAULT_BOUNTY_BPS: string;
    BENEFICIAL_REWARD_PATH: Array<string>;
  }

  const config = ConfigEntity.getConfig();

  const shortWorkerInfos: IDeltaNeutralWorkerInput[] = [
    {
      VAULT_SYMBOL: "ibFTM",
      WORKER_NAME: "USDC-WFTM 3x DeltaNeutralSpookyWorker",
      TREASURY_ADDRESS: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 2,
      REINVEST_BOUNTY_BPS: "1500",
      REINVEST_PATH: ["BOO", "WFTM"],
      REINVEST_THRESHOLD: "10000",
      WORK_FACTOR: "8000",
      KILL_FACTOR: "0",
      MAX_PRICE_DIFF: "10500",
      BENEFICIAL_REWARD_PATH: ["BOO", "WFTM", "ALPACA"],
      BENEFICIAL_VAULT: "0xe32840F950F709148fdB9Ff22712083Ac40033A0",
      BENEFICIAL_VAULT_BOUNTY_BPS: "5333",
    },
    {
      VAULT_SYMBOL: "ibUSDC",
      WORKER_NAME: "WFTM-USDC 3x DeltaNeutralSpookyWorker",
      TREASURY_ADDRESS: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 2,
      REINVEST_BOUNTY_BPS: "1500",
      REINVEST_PATH: ["BOO", "WFTM", "USDC"],
      REINVEST_THRESHOLD: "10000",
      WORK_FACTOR: "8000",
      KILL_FACTOR: "0",
      MAX_PRICE_DIFF: "10500",
      BENEFICIAL_REWARD_PATH: ["BOO", "WFTM", "ALPACA"],
      BENEFICIAL_VAULT: "0xe32840F950F709148fdB9Ff22712083Ac40033A0",
      BENEFICIAL_VAULT_BOUNTY_BPS: "5333",
    },
  ];
  const TITLE = "mainnet_delta_neutral_3x_spooky_worker";
  const EXACT_ETA = "1646402400"; //FTM DO NOT HAVE TIMELOCK LEAVE THIS VALUE

  const deployer = await getDeployer();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const gasPriceService = new BlockScanGasPrice(network.name);
  const gasPrice = await gasPriceService.getFastGasPrice();
  const workerInfos: IDeltaNeutralWorkerInfo[] = shortWorkerInfos.map((n) => {
    const vault = config.Vaults.find((v) => v.symbol === n.VAULT_SYMBOL);
    if (vault === undefined) {
      throw `error: unable to find vault from ${n.VAULT_SYMBOL}`;
    }

    const tokenList: any = config.Tokens;
    const reinvestPath: Array<string> = n.REINVEST_PATH.map((p) => {
      const addr = tokenList[p];
      if (addr === undefined) {
        throw `error: path: unable to find address of ${p}`;
      }
      return addr;
    });

    const beneficialRewardPath: Array<string> = n.BENEFICIAL_REWARD_PATH.map((p) => {
      const addr = tokenList[p];
      if (addr === undefined) {
        throw `error: path: unable to find address of ${p}`;
      }
      return addr;
    });

    return {
      WORKER_NAME: n.WORKER_NAME,
      VAULT_CONFIG_ADDR: vault.config,
      WORKER_CONFIG_ADDR: config.SharedConfig.WorkerConfig,
      REINVEST_BOT: n.REINVEST_BOT,
      POOL_ID: n.POOL_ID,
      VAULT_ADDR: vault.address,
      BASE_TOKEN_ADDR: vault.baseToken,
      DELTA_NEUTRAL_ORACLE: config.Oracle.DeltaNeutralOracle!,
      MASTER_CHEF: config.YieldSources.SpookySwap!.SpookyMasterChef,
      ROUTER_ADDR: config.YieldSources.SpookySwap!.SpookyRouter,
      ADD_STRAT_ADDR: config.SharedStrategies.SpookySwap!.StrategyAddBaseTokenOnly,
      LIQ_STRAT_ADDR: config.SharedStrategies.SpookySwap!.StrategyLiquidate,
      TWO_SIDES_STRAT_ADDR: vault.StrategyAddTwoSidesOptimal.SpookySwap!,
      PARTIAL_CLOSE_LIQ_STRAT_ADDR: config.SharedStrategies.SpookySwap!.StrategyPartialCloseLiquidate,
      PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR: config.SharedStrategies.SpookySwap!.StrategyPartialCloseMinimizeTrading,
      MINIMIZE_TRADE_STRAT_ADDR: config.SharedStrategies.SpookySwap!.StrategyWithdrawMinimizeTrading,
      REINVEST_BOUNTY_BPS: n.REINVEST_BOUNTY_BPS,
      REINVEST_PATH: reinvestPath,
      REINVEST_THRESHOLD: ethers.utils.parseEther(n.REINVEST_THRESHOLD).toString(),
      WORK_FACTOR: n.WORK_FACTOR,
      KILL_FACTOR: n.KILL_FACTOR,
      MAX_PRICE_DIFF: n.MAX_PRICE_DIFF,
      TIMELOCK: config.Timelock,
      BENEFICIAL_VAULT: n.BENEFICIAL_VAULT,
      BENEFICIAL_VAULT_BOUNTY_BPS: n.BENEFICIAL_VAULT_BOUNTY_BPS,
      BENEFICIAL_REWARD_PATH: beneficialRewardPath,
    };
  });
  for (let i = 0; i < workerInfos.length; i++) {
    const workerInfo = workerInfos[i];
    console.log("===================================================================================");
    console.log(`>> Deploying an upgradable SpookyWorker contract for ${workerInfos[i].WORKER_NAME}`);

    const DeltaNeutralSpookyWorker03 = (await ethers.getContractFactory(
      "DeltaNeutralSpookyWorker03",
      deployer
    )) as DeltaNeutralSpookyWorker03__factory;

    const deltaNeutralWorker = (await upgrades.deployProxy(DeltaNeutralSpookyWorker03, [
      workerInfo.VAULT_ADDR,
      workerInfo.BASE_TOKEN_ADDR,
      workerInfo.MASTER_CHEF,
      workerInfo.ROUTER_ADDR,
      workerInfo.POOL_ID,
      workerInfo.ADD_STRAT_ADDR,
      workerInfo.REINVEST_BOUNTY_BPS,
      deployer.address,
      workerInfo.REINVEST_PATH,
      workerInfo.REINVEST_THRESHOLD,
      workerInfo.DELTA_NEUTRAL_ORACLE,
    ])) as DeltaNeutralSpookyWorker03;

    const deployTxReceipt = await deltaNeutralWorker.deployTransaction.wait(3);
    console.log(`>> Deployed at ${deltaNeutralWorker.address}`);
    console.log(`>> Deployed block: ${deployTxReceipt.blockNumber}`);

    let nonce = await deployer.getTransactionCount();

    console.log(`>> Adding REINVEST_BOT`);
    await deltaNeutralWorker.setReinvestorOk([workerInfo.REINVEST_BOT], true, { gasPrice, nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Adding Treasuries`);
    await deltaNeutralWorker.setTreasuryConfig(workerInfo.REINVEST_BOT, workerInfo.REINVEST_BOUNTY_BPS, {
      gasPrice,
      nonce: nonce++,
    });
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    const okStrats = [workerInfo.LIQ_STRAT_ADDR, workerInfo.TWO_SIDES_STRAT_ADDR, workerInfo.MINIMIZE_TRADE_STRAT_ADDR];
    if (workerInfo.PARTIAL_CLOSE_LIQ_STRAT_ADDR != "") {
      okStrats.push(workerInfo.PARTIAL_CLOSE_LIQ_STRAT_ADDR);
    }
    if (workerInfo.PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR != "") {
      okStrats.push(workerInfo.PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR);
    }

    await deltaNeutralWorker.setStrategyOk(okStrats, true, { gasPrice, nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on strats`);
    const addStrat = SpookySwapStrategyAddBaseTokenOnly__factory.connect(workerInfo.ADD_STRAT_ADDR, deployer);
    await addStrat.setWorkersOk([deltaNeutralWorker.address], true, { gasPrice, nonce: nonce++ });
    const liqStrat = SpookySwapStrategyLiquidate__factory.connect(workerInfo.LIQ_STRAT_ADDR, deployer);

    await liqStrat.setWorkersOk([deltaNeutralWorker.address], true, { gasPrice, nonce: nonce++ });

    const twoSidesStrat = SpookySwapStrategyAddTwoSidesOptimal__factory.connect(
      workerInfo.TWO_SIDES_STRAT_ADDR,
      deployer
    );

    await twoSidesStrat.setWorkersOk([deltaNeutralWorker.address], true, { gasPrice, nonce: nonce++ });
    const minimizeStrat = SpookySwapStrategyWithdrawMinimizeTrading__factory.connect(
      workerInfo.MINIMIZE_TRADE_STRAT_ADDR,
      deployer
    );
    await minimizeStrat.setWorkersOk([deltaNeutralWorker.address], true, { gasPrice, nonce: nonce++ });

    if (workerInfo.PARTIAL_CLOSE_LIQ_STRAT_ADDR != "") {
      console.log(">> partial close liquidate is deployed");
      const partialCloseLiquidate = SpookySwapStrategyPartialCloseLiquidate__factory.connect(
        workerInfo.PARTIAL_CLOSE_LIQ_STRAT_ADDR,
        deployer
      );
      await partialCloseLiquidate.setWorkersOk([deltaNeutralWorker.address], true, { gasPrice, nonce: nonce++ });
    }

    if (workerInfo.PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR != "") {
      console.log(">> partial close minimize is deployed");
      const partialCloseMinimize = SpookySwapStrategyPartialCloseMinimizeTrading__factory.connect(
        workerInfo.PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR,
        deployer
      );
      await partialCloseMinimize.setWorkersOk([deltaNeutralWorker.address], true, { gasPrice, nonce: nonce++ });
    }

    console.log(">> setBeneficialVaultConfig");
    const worker = SpookyWorker03__factory.connect(deltaNeutralWorker.address, deployer);
    await worker.setBeneficialVaultConfig(
      workerInfo.BENEFICIAL_VAULT_BOUNTY_BPS,
      workerInfo.BENEFICIAL_VAULT,
      workerInfo.BENEFICIAL_REWARD_PATH,
      {
        gasPrice,
        nonce: nonce++,
      }
    );

    console.log("✅ Done");

    console.log(">> Timelock PART");

    const workerConfig = await WorkerConfig__factory.connect(workerInfo.WORKER_CONFIG_ADDR, deployer);

    const isTimelockedWorkerConfig = compare(await workerConfig.owner(), config.Timelock);

    if (isTimelockedWorkerConfig) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `>> Queue tx on Timelock Setting WorkerConfig via Timelock at ${workerInfo.WORKER_CONFIG_ADDR} for ${deltaNeutralWorker.address}`,
          workerInfo.WORKER_CONFIG_ADDR,
          "0",
          "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
          ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
          [
            [deltaNeutralWorker.address],
            [
              {
                acceptDebt: true,
                workFactor: workerInfo.WORK_FACTOR,
                killFactor: workerInfo.KILL_FACTOR,
                maxPriceDiff: workerInfo.MAX_PRICE_DIFF,
              },
            ],
          ],
          EXACT_ETA,
          { gasPrice, nonce: nonce++ }
        )
      );
      console.log("✅ Done");
    } else {
      console.log(`>> SET WorkerConfig ${workerInfo.WORKER_CONFIG_ADDR} for ${deltaNeutralWorker.address}`);
      await workerConfig.setConfigs(
        [deltaNeutralWorker.address],
        [
          {
            acceptDebt: true,
            workFactor: workerInfo.WORK_FACTOR,
            killFactor: workerInfo.KILL_FACTOR,
            maxPriceDiff: workerInfo.MAX_PRICE_DIFF,
          },
        ],
        { gasPrice, nonce: nonce++ }
      );
    }

    const vaultConfig = ConfigurableInterestVaultConfig__factory.connect(workerInfo.VAULT_CONFIG_ADDR, deployer);

    const isTimeLockVaultConfig = compare(await vaultConfig.owner(), config.Timelock);

    if (isTimeLockVaultConfig) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `>> Queue tx on Timelock Linking VaultConfig with WorkerConfig via Timelock for ${workerInfo.VAULT_CONFIG_ADDR}`,
          workerInfo.VAULT_CONFIG_ADDR,
          "0",
          "setWorkers(address[],address[])",
          ["address[]", "address[]"],
          [[deltaNeutralWorker.address], [workerInfo.WORKER_CONFIG_ADDR]],
          EXACT_ETA,
          { gasPrice, nonce: nonce++ }
        )
      );
      console.log("✅ Done");
    } else {
      console.log(` >> SET VaultConfig  for  ${workerInfo.VAULT_CONFIG_ADDR}`);
      await vaultConfig.setWorkers([deltaNeutralWorker.address], [workerInfo.WORKER_CONFIG_ADDR]);
    }

    if (isTimelockedWorkerConfig || isTimeLockVaultConfig) {
      FileService.write(TITLE, timelockTransactions);
    }
  }
};

export default func;
func.tags = ["DeltaNeutralSpookyWorker03"];
