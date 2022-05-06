import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import {
  ConfigurableInterestVaultConfig__factory,
  Timelock__factory,
  WaultSwapRestrictedStrategyAddBaseTokenOnly__factory,
  WaultSwapWorker02,
  WorkerConfig__factory,
} from "../../../../typechain";
import { TimelockEntity } from "../../../entities";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { UpgradeableContractDeployer } from "../../../deployer";
import { fileService, TimelockService } from "../../../services";
import { compare } from "../../../../utils/address";
import { WorkersEntity } from "../../../interfaces/config";

interface IWorkerInput {
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
  EXACT_ETA: string;
}

interface IWaultWorkerInfo {
  WORKER_NAME: string;
  VAULT_CONFIG_ADDR: string;
  WORKER_CONFIG_ADDR: string;
  REINVEST_BOT: string;
  POOL_ID: number;
  VAULT_ADDR: string;
  BASE_TOKEN_ADDR: string;
  MASTER_CHEF_ADDR: string;
  WSWAP_ROUTER_ADDR: string;
  ADD_STRAT_ADDR: string;
  LIQ_STRAT_ADDR: string;
  TWO_SIDES_STRAT_ADDR: string;
  MINIMIZE_TRADE_STRAT_ADDR: string;
  PARTIAL_CLOSE_LIQ_ADDR: string;
  PARTIAL_CLOSE_MINIMIZE_ADDR: string;
  REINVEST_BOUNTY_BPS: string;
  REINVEST_PATH: Array<string>;
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
  const executeFileTitle = "wswap-workers02";
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  const shortWorkerInfos: IWorkerInput[] = [
    {
      VAULT_SYMBOL: "ibBUSD",
      WORKER_NAME: "WUSD-BUSD WaultswapWorker",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 58,
      REINVEST_BOUNTY_BPS: "300",
      REINVEST_PATH: ["WEX", "WBNB", "BUSD"],
      REINVEST_THRESHOLD: "2000",
      WORK_FACTOR: "7800",
      KILL_FACTOR: "9000",
      MAX_PRICE_DIFF: "10500",
      EXACT_ETA: "1630467000",
    },
  ];

  const deployer = await getDeployer();

  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  const workerInfos: IWaultWorkerInfo[] = shortWorkerInfos.map((n) => {
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

    return {
      WORKER_NAME: n.WORKER_NAME,
      VAULT_CONFIG_ADDR: vault.config,
      WORKER_CONFIG_ADDR: config.SharedConfig.WorkerConfig,
      REINVEST_BOT: n.REINVEST_BOT,
      POOL_ID: n.POOL_ID,
      VAULT_ADDR: vault.address,
      BASE_TOKEN_ADDR: vault.baseToken,
      MASTER_CHEF_ADDR: config.YieldSources.Waultswap!.WexMaster,
      WSWAP_ROUTER_ADDR: config.YieldSources.Waultswap!.WaultswapRouter,
      ADD_STRAT_ADDR: config.SharedStrategies.Waultswap!.StrategyAddBaseTokenOnly,
      LIQ_STRAT_ADDR: config.SharedStrategies.Waultswap!.StrategyLiquidate,
      TWO_SIDES_STRAT_ADDR: vault.StrategyAddTwoSidesOptimal.Waultswap!,
      MINIMIZE_TRADE_STRAT_ADDR: config.SharedStrategies.Waultswap!.StrategyWithdrawMinimizeTrading,
      PARTIAL_CLOSE_LIQ_ADDR: config.SharedStrategies.Waultswap!.StrategyPartialCloseLiquidate,
      PARTIAL_CLOSE_MINIMIZE_ADDR: config.SharedStrategies.Waultswap!.StrategyPartialCloseMinimizeTrading,
      REINVEST_BOUNTY_BPS: n.REINVEST_BOUNTY_BPS,
      REINVEST_PATH: reinvestPath,
      REINVEST_THRESHOLD: ethers.utils.parseEther(n.REINVEST_THRESHOLD).toString(),
      WORK_FACTOR: n.WORK_FACTOR,
      KILL_FACTOR: n.KILL_FACTOR,
      MAX_PRICE_DIFF: n.MAX_PRICE_DIFF,
      TIMELOCK: config.Timelock,
      EXACT_ETA: n.EXACT_ETA,
    };
  });

  for (let i = 0; i < workerInfos.length; i++) {
    const waultswapWorker02Deployer = new UpgradeableContractDeployer<WaultSwapWorker02>(
      deployer,
      "WaultSwapWorker02",
      workerInfos[i].WORKER_NAME
    );

    const { contract: waultswapWorker02, deployedBlock } = await waultswapWorker02Deployer.deploy([
      workerInfos[i].VAULT_ADDR,
      workerInfos[i].BASE_TOKEN_ADDR,
      workerInfos[i].MASTER_CHEF_ADDR,
      workerInfos[i].WSWAP_ROUTER_ADDR,
      workerInfos[i].POOL_ID,
      workerInfos[i].ADD_STRAT_ADDR,
      workerInfos[i].LIQ_STRAT_ADDR,
      workerInfos[i].REINVEST_BOUNTY_BPS,
      workerInfos[i].REINVEST_BOT,
      workerInfos[i].REINVEST_PATH,
      workerInfos[i].REINVEST_THRESHOLD,
    ]);

    let nonce = await deployer.getTransactionCount();

    console.log(`>> Adding REINVEST_BOT`);
    await waultswapWorker02.setReinvestorOk([workerInfos[i].REINVEST_BOT], true);
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    const okStrats = [
      workerInfos[i].TWO_SIDES_STRAT_ADDR,
      workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_LIQ_ADDR,
      workerInfos[i].PARTIAL_CLOSE_MINIMIZE_ADDR,
    ];
    await waultswapWorker02.setStrategyOk(okStrats, true);
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on ok strats`);
    const allOkStrats = [workerInfos[i].ADD_STRAT_ADDR, workerInfos[i].LIQ_STRAT_ADDR, ...okStrats];

    for (const stratAddress of allOkStrats) {
      // NOTE: all WaultSwapRestrictedStrategy have the same signature of func setWorkersOk.
      //       then we can use any WaultSwapRestrictedStrategy factory for all WaultSwapRestrictedStrategy addresses
      const contractFactory = WaultSwapRestrictedStrategyAddBaseTokenOnly__factory.connect(stratAddress, deployer);
      await contractFactory.setWorkersOk([waultswapWorker02.address], true, { nonce: nonce++ });
    }
    console.log("✅ Done");

    const workerConfig = WorkerConfig__factory.connect(workerInfos[i].WORKER_CONFIG_ADDR, deployer);
    const vaultConfig = ConfigurableInterestVaultConfig__factory.connect(workerInfos[i].VAULT_CONFIG_ADDR, deployer);

    const timelock = Timelock__factory.connect(workerInfos[i].TIMELOCK, deployer);

    const [workerOwnerAddress, vaultOwnerAddress] = await Promise.all([workerConfig.owner(), vaultConfig.owner()]);

    if (compare(workerOwnerAddress, timelock.address)) {
      const setConfigsTx = await TimelockService.queueTransaction(
        `>> Queue tx on Timelock Setting WorkerConfig via Timelock at ${workerInfos[i].WORKER_CONFIG_ADDR} for ${waultswapWorker02.address} ETA ${workerInfos[i].EXACT_ETA}`,
        workerInfos[i].WORKER_CONFIG_ADDR,
        "0",
        "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
        ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
        [
          [waultswapWorker02.address],
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
          [waultswapWorker02.address],
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
        [[waultswapWorker02.address], [workerInfos[i].WORKER_CONFIG_ADDR]],
        workerInfos[i].EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("15", "gwei"), nonce: nonce++ }
      );
      timelockTransactions.push(setWorkersTx);
      fileService.writeJson(executeFileTitle, timelockTransactions);
      console.log("✅ Done");
    } else {
      console.log(">> Linking VaultConfig with WorkerConfig");
      (
        await vaultConfig.setWorkers([waultswapWorker02.address], [workerInfos[i].WORKER_CONFIG_ADDR], {
          nonce: nonce++,
        })
      ).wait(3);
      console.log("✅ Done");
    }

    const lpPoolAddress = config.YieldSources.Waultswap!.pools.find(
      (pool) => pool.pId === workerInfos[i].POOL_ID
    )!.address;

    const workerEntity: WorkersEntity = {
      name: workerInfos[i].WORKER_NAME,
      address: waultswapWorker02.address,
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
        StrategyPartialCloseLiquidate: workerInfos[i].PARTIAL_CLOSE_LIQ_ADDR,
        StrategyPartialCloseMinimizeTrading: workerInfos[i].PARTIAL_CLOSE_MINIMIZE_ADDR,
      },
    };

    config = configFileHelper.addOrSetVaultWorker(workerInfos[i].VAULT_ADDR, workerEntity);
  }
};

export default func;
func.tags = ["WaultSwapWorkers02"];
