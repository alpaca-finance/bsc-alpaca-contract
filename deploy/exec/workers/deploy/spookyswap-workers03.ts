import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import {
  ConfigurableInterestVaultConfig__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  SpookyWorker03,
  Timelock__factory,
  WorkerConfig__factory,
} from "../../../../typechain";
import { TimelockEntity } from "../../../entities";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { UpgradeableContractDeployer } from "../../../deployer";
import { compare } from "../../../../utils/address";
import { fileService, TimelockService } from "../../../services";
import { WorkersEntity } from "../../../interfaces/config";

interface IBeneficialVaultInput {
  BENEFICIAL_VAULT_BPS: string;
  BENEFICIAL_VAULT_ADDRESS: string;
  REWARD_PATH: Array<string>;
}

interface ISpookySwapWorkerInput {
  VAULT_SYMBOL: string;
  WORKER_NAME: string;
  REINVEST_BOT: string;
  POOL_ID: number;
  REINVEST_BOUNTY_BPS: string;
  REINVEST_PATH: Array<string>;
  REINVEST_THRESHOLD: string;
  WORK_FACTOR: string;
  KILL_FACTOR: string;
  MAX_PRICE_DIFF: string;
  BENEFICIAL_VAULT?: IBeneficialVaultInput;
  EXACT_ETA: string;
}

interface ISookySwapWorkerInfo {
  WORKER_NAME: string;
  VAULT_CONFIG_ADDR: string;
  WORKER_CONFIG_ADDR: string;
  REINVEST_BOT: string;
  POOL_ID: number;
  VAULT_ADDR: string;
  BASE_TOKEN_ADDR: string;
  MASTER_CHEF_ADDR: string;
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
  BENEFICIAL_VAULT?: IBeneficialVaultInput;
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
  const shortWorkerInfos: ISpookySwapWorkerInput[] = [
    {
      VAULT_SYMBOL: "ibUSDC",
      WORKER_NAME: "BOO-USDC SpookyWorker",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 69,
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_PATH: ["BOO", "USDC"],
      REINVEST_THRESHOLD: "0",
      BENEFICIAL_VAULT: {
        BENEFICIAL_VAULT_ADDRESS: "0xe32840F950F709148fdB9Ff22712083Ac40033A0",
        REWARD_PATH: ["BOO", "WFTM", "ALPACA"],
        BENEFICIAL_VAULT_BPS: "5555",
      },
      WORK_FACTOR: "7000",
      KILL_FACTOR: "8333",
      MAX_PRICE_DIFF: "11000",
      EXACT_ETA: "88888888", // no use due to no timelock
    },
  ];

  const executeFileTitle = "spookyswap-workers03";
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  const deployer = await getDeployer();

  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  const workerInfos: ISookySwapWorkerInfo[] = shortWorkerInfos.map((n) => {
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

    const beneficialVault = n.BENEFICIAL_VAULT;
    if (beneficialVault !== undefined) {
      beneficialVault.REWARD_PATH = beneficialVault.REWARD_PATH.map((p) => {
        const addr = tokenList[p];
        if (addr === undefined) {
          throw `error: path: unable to find address of ${p}`;
        }
        return addr;
      });
    }

    return {
      WORKER_NAME: n.WORKER_NAME,
      VAULT_CONFIG_ADDR: vault.config,
      WORKER_CONFIG_ADDR: config.SharedConfig.WorkerConfig,
      REINVEST_BOT: n.REINVEST_BOT,
      POOL_ID: n.POOL_ID,
      VAULT_ADDR: vault.address,
      BASE_TOKEN_ADDR: vault.baseToken,
      MASTER_CHEF_ADDR: config.YieldSources.SpookySwap!.SpookyMasterChef,
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
      BENEFICIAL_VAULT: beneficialVault,
      TIMELOCK: config.Timelock,
      EXACT_ETA: n.EXACT_ETA,
    };
  });

  for (let i = 0; i < workerInfos.length; i++) {
    const spookyWorker03Deployer = new UpgradeableContractDeployer<SpookyWorker03>(
      deployer,
      "SpookyWorker03",
      workerInfos[i].WORKER_NAME
    );

    const { contract: spookyWorker03, deployedBlock } = await spookyWorker03Deployer.deploy([
      workerInfos[i].VAULT_ADDR,
      workerInfos[i].BASE_TOKEN_ADDR,
      workerInfos[i].MASTER_CHEF_ADDR,
      workerInfos[i].ROUTER_ADDR,
      workerInfos[i].POOL_ID,
      workerInfos[i].ADD_STRAT_ADDR,
      workerInfos[i].LIQ_STRAT_ADDR,
      workerInfos[i].REINVEST_BOUNTY_BPS,
      workerInfos[i].REINVEST_BOT,
      workerInfos[i].REINVEST_PATH,
      workerInfos[i].REINVEST_THRESHOLD,
    ]);

    console.log(">> Waiting for SpookyWorker03 to be ready...");
    await new Promise((f) => setTimeout(f, 10000));
    console.log(">> Done");

    let nonce = await deployer.getTransactionCount();

    console.log(`>> Adding REINVEST_BOT`);
    await spookyWorker03.setReinvestorOk([workerInfos[i].REINVEST_BOT], true, { nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    const okStrats = [
      workerInfos[i].TWO_SIDES_STRAT_ADDR,
      workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR,
    ];

    await spookyWorker03.setStrategyOk(okStrats, true, { nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on ok strats`);
    const allOkStrats = [workerInfos[i].ADD_STRAT_ADDR, workerInfos[i].LIQ_STRAT_ADDR, ...okStrats];

    for (const stratAddress of allOkStrats) {
      // NOTE: all PancakeswapV2RestrictedStrategy have the same signature of func setWorkersOk.
      //       then we can use any PancakeswapV2RestrictedStrategy factory for all PancakeswapV2RestrictedStrategy addresses
      const contractFactory = PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory.connect(stratAddress, deployer);
      await contractFactory.setWorkersOk([spookyWorker03.address], true, { nonce: nonce++ });
    }
    console.log("✅ Done");

    if (workerInfos[i].BENEFICIAL_VAULT) {
      console.log(">> config baneficial vault");
      await spookyWorker03.setBeneficialVaultConfig(
        workerInfos[i].BENEFICIAL_VAULT!.BENEFICIAL_VAULT_BPS,
        workerInfos[i].BENEFICIAL_VAULT!.BENEFICIAL_VAULT_ADDRESS,
        workerInfos[i].BENEFICIAL_VAULT!.REWARD_PATH,
        { nonce: nonce++ }
      );
      console.log("✅ Done");
    }

    const workerConfig = WorkerConfig__factory.connect(workerInfos[i].WORKER_CONFIG_ADDR, deployer);
    const vaultConfig = ConfigurableInterestVaultConfig__factory.connect(workerInfos[i].VAULT_CONFIG_ADDR, deployer);

    const timelock = Timelock__factory.connect(workerInfos[i].TIMELOCK, deployer);

    const [workerOwnerAddress, vaultOwnerAddress] = await Promise.all([workerConfig.owner(), vaultConfig.owner()]);

    if (compare(workerOwnerAddress, timelock.address)) {
      console.log(">> Timelock: Setting WorkerConfig via Timelock");
      const setConfigsTx = await TimelockService.queueTransaction(
        `>> Queue tx on Timelock Setting WorkerConfig via Timelock at ${workerInfos[i].WORKER_CONFIG_ADDR} for ${spookyWorker03.address} ETA ${workerInfos[i].EXACT_ETA}`,
        workerInfos[i].WORKER_CONFIG_ADDR,
        "0",
        "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
        ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
        [
          [spookyWorker03.address],
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
          [spookyWorker03.address],
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
        [[spookyWorker03.address], [workerInfos[i].WORKER_CONFIG_ADDR]],
        workerInfos[i].EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("15", "gwei"), nonce: nonce++ }
      );
      timelockTransactions.push(setWorkersTx);
      fileService.writeJson(executeFileTitle, timelockTransactions);
      console.log("✅ Done");
    } else {
      console.log(">> Linking VaultConfig with WorkerConfig");
      (
        await vaultConfig.setWorkers([spookyWorker03.address], [workerInfos[i].WORKER_CONFIG_ADDR], { nonce: nonce++ })
      ).wait(3);
      console.log("✅ Done");
    }

    const lpPoolAddress = config.YieldSources.SpookySwap!.pools.find(
      (pool) => pool.pId === workerInfos[i].POOL_ID
    )!.address;

    const biswapWorkersEntity: WorkersEntity = {
      name: workerInfos[i].WORKER_NAME,
      address: spookyWorker03.address,
      deployedBlock: deployedBlock,
      config: workerInfos[i].WORKER_CONFIG_ADDR,
      pId: workerInfos[i].POOL_ID,
      stakingToken: lpPoolAddress,
      stakingTokenAt: workerInfos[i].MASTER_CHEF_ADDR,
      strategies: {
        StrategyAddAllBaseToken: workerInfos[i].ADD_STRAT_ADDR,
        StrategyLiquidate: workerInfos[i].LIQ_STRAT_ADDR,
        StrategyAddTwoSidesOptimal: workerInfos[i].TWO_SIDES_STRAT_ADDR,
        StrategyWithdrawMinimizeTrading: workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
        StrategyPartialCloseLiquidate: workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR,
        StrategyPartialCloseMinimizeTrading: workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR,
      },
    };

    config = configFileHelper.addOrSetVaultWorker(workerInfos[i].VAULT_ADDR, biswapWorkersEntity);
  }
};

export default func;
func.tags = ["SpookyWorkers03"];
