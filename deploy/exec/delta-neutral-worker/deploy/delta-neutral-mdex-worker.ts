import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network, upgrades } from "hardhat";
import {
  DeltaNeutralMdexWorker02,
  DeltaNeutralMdexWorker02__factory,
  MdexRestrictedStrategyAddBaseTokenOnly__factory,
  MdexRestrictedStrategyAddTwoSidesOptimal__factory,
  MdexRestrictedStrategyLiquidate__factory,
  MdexRestrictedStrategyPartialCloseLiquidate__factory,
  MdexRestrictedStrategyPartialCloseMinimizeTrading__factory,
  MdexRestrictedStrategyWithdrawMinimizeTrading__factory,
} from "../../../../typechain";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { fileService, TimelockService } from "../../../services";

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

  interface IDeltaNeutralMdexWorkerInput {
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
  }

  interface IDeltaNeutralMdexWorkerInfo {
    WORKER_NAME: string;
    VAULT_CONFIG_ADDR: string;
    WORKER_CONFIG_ADDR: string;
    REINVEST_BOT: string;
    POOL_ID: number;
    VAULT_ADDR: string;
    BASE_TOKEN_ADDR: string;
    BSC_POOL: string;
    MDEX_ROUTER_ADDR: string;
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
  }

  const shortWorkerInfos: IDeltaNeutralMdexWorkerInput[] = [
    {
      VAULT_SYMBOL: "ibBUSD",
      WORKER_NAME: "WBNB-BUSD DeltaNeutralMdexWorker",
      TREASURY_ADDRESS: "0x2DD872C6f7275DAD633d7Deb1083EDA561E9B96b",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 53,
      REINVEST_BOUNTY_BPS: "300",
      REINVEST_PATH: ["MDX", "BUSD"],
      REINVEST_THRESHOLD: "0",
      WORK_FACTOR: "7000",
      KILL_FACTOR: "8333",
      MAX_PRICE_DIFF: "11000",
    },
    {
      VAULT_SYMBOL: "ibWBNB",
      WORKER_NAME: "BUSD-WBNB DeltaNeutralMdexWorker",
      TREASURY_ADDRESS: "0x2DD872C6f7275DAD633d7Deb1083EDA561E9B96b",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 53,
      REINVEST_BOUNTY_BPS: "300",
      REINVEST_PATH: ["MDX", "WBNB"],
      REINVEST_THRESHOLD: "0",
      WORK_FACTOR: "7000",
      KILL_FACTOR: "8333",
      MAX_PRICE_DIFF: "11000",
    },
  ];

  const TITLE = "testnet_delta_neutral_mdex_worker";
  const DELTA_NEUTRAL_ORACLE_ADDR = "0x6F904F6c13EA3a80dD962f0150E49d943b7d1819";
  const EXACT_ETA = "";

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  let nonce = await deployer.getTransactionCount();
  const workerInfos: IDeltaNeutralMdexWorkerInfo[] = shortWorkerInfos.map((n) => {
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
      BSC_POOL: config.YieldSources.Mdex!.BSCPool,
      MDEX_ROUTER_ADDR: config.YieldSources.Mdex!.MdexRouter,
      ADD_STRAT_ADDR: config.SharedStrategies.Mdex!.StrategyAddBaseTokenOnly,
      LIQ_STRAT_ADDR: config.SharedStrategies.Mdex!.StrategyLiquidate,
      TWO_SIDES_STRAT_ADDR: vault.StrategyAddTwoSidesOptimal.Mdex!,
      PARTIAL_CLOSE_LIQ_STRAT_ADDR: config.SharedStrategies.Mdex!.StrategyPartialCloseLiquidate,
      PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR: config.SharedStrategies.Mdex!.StrategyPartialCloseMinimizeTrading,
      MINIMIZE_TRADE_STRAT_ADDR: config.SharedStrategies.Mdex!.StrategyWithdrawMinimizeTrading,
      REINVEST_BOUNTY_BPS: n.REINVEST_BOUNTY_BPS,
      REINVEST_PATH: reinvestPath,
      REINVEST_THRESHOLD: ethers.utils.parseEther(n.REINVEST_THRESHOLD).toString(),
      WORK_FACTOR: n.WORK_FACTOR,
      KILL_FACTOR: n.KILL_FACTOR,
      MAX_PRICE_DIFF: n.MAX_PRICE_DIFF,
      TIMELOCK: config.Timelock,
    };
  });
  for (let i = 0; i < workerInfos.length; i++) {
    console.log("===================================================================================");
    console.log(`>> Deploying an upgradable DeltaNeutralMdexWorker02 contract for ${workerInfos[i].WORKER_NAME}`);
    const DeltaNeutralMdexWorker02 = (await ethers.getContractFactory(
      "DeltaNeutralMdexWorker02",
      deployer
    )) as DeltaNeutralMdexWorker02__factory;

    const deltaNeutralWorker = (await upgrades.deployProxy(DeltaNeutralMdexWorker02, [
      workerInfos[i].VAULT_ADDR,
      workerInfos[i].BASE_TOKEN_ADDR,
      workerInfos[i].BSC_POOL,
      workerInfos[i].MDEX_ROUTER_ADDR,
      workerInfos[i].POOL_ID,
      workerInfos[i].ADD_STRAT_ADDR,
      workerInfos[i].REINVEST_BOUNTY_BPS,
      deployer.address,
      workerInfos[i].REINVEST_PATH,
      workerInfos[i].REINVEST_THRESHOLD,
      DELTA_NEUTRAL_ORACLE_ADDR,
    ])) as DeltaNeutralMdexWorker02;
    await deltaNeutralWorker.deployed();
    console.log(`>> Deployed at ${deltaNeutralWorker.address}`);

    console.log(`>> Adding REINVEST_BOT`);
    await deltaNeutralWorker.setReinvestorOk([workerInfos[i].REINVEST_BOT], true);
    console.log("✅ Done");

    console.log(`>> Adding Treasuries`);
    await deltaNeutralWorker.setTreasuryConfig(deployer.address, workerInfos[i].REINVEST_BOUNTY_BPS);
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    const okStrats = [workerInfos[i].TWO_SIDES_STRAT_ADDR, workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR];
    if (workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR != "") {
      okStrats.push(workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR);
    }
    if (workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR != "") {
      okStrats.push(workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR);
    }

    await deltaNeutralWorker.setStrategyOk(okStrats, true);
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on strats`);
    const addStrat = MdexRestrictedStrategyAddBaseTokenOnly__factory.connect(workerInfos[i].ADD_STRAT_ADDR, deployer);
    await addStrat.setWorkersOk([deltaNeutralWorker.address], true);
    const liqStrat = MdexRestrictedStrategyLiquidate__factory.connect(workerInfos[i].LIQ_STRAT_ADDR, deployer);
    await liqStrat.setWorkersOk([deltaNeutralWorker.address], true);
    const twoSidesStrat = MdexRestrictedStrategyAddTwoSidesOptimal__factory.connect(
      workerInfos[i].TWO_SIDES_STRAT_ADDR,
      deployer
    );
    await twoSidesStrat.setWorkersOk([deltaNeutralWorker.address], true);
    const minimizeStrat = MdexRestrictedStrategyWithdrawMinimizeTrading__factory.connect(
      workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
      deployer
    );
    await minimizeStrat.setWorkersOk([deltaNeutralWorker.address], true);

    if (workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR != "") {
      console.log(">> partial close liquidate is deployed");
      const partialCloseLiquidate = MdexRestrictedStrategyPartialCloseLiquidate__factory.connect(
        workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR,
        deployer
      );
      await partialCloseLiquidate.setWorkersOk([deltaNeutralWorker.address], true);
    }

    if (workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR != "") {
      console.log(">> partial close minimize is deployed");
      const partialCloseMinimize = MdexRestrictedStrategyPartialCloseMinimizeTrading__factory.connect(
        workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR,
        deployer
      );
      await partialCloseMinimize.setWorkersOk([deltaNeutralWorker.address], true);
    }
    console.log("✅ Done");

    console.log(">> Timelock");
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `>> Queue tx on Timelock Setting WorkerConfig via Timelock at ${workerInfos[i].WORKER_CONFIG_ADDR} for ${deltaNeutralWorker.address}`,
        workerInfos[i].WORKER_CONFIG_ADDR,
        "0",
        "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
        ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
        [
          [deltaNeutralWorker.address],
          [
            {
              acceptDebt: true,
              workFactor: workerInfos[i].WORK_FACTOR,
              killFactor: workerInfos[i].KILL_FACTOR,
              maxPriceDiff: workerInfos[i].MAX_PRICE_DIFF,
            },
          ],
        ],
        EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("15", "gwei"), nonce: nonce++ }
      )
    );
    console.log("✅ Done");

    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `>> Queue tx on Timelock Linking VaultConfig with WorkerConfig via Timelock for ${workerInfos[i].VAULT_CONFIG_ADDR}`,
        workerInfos[i].VAULT_CONFIG_ADDR,
        "0",
        "setWorkers(address[],address[])",
        ["address[]", "address[]"],
        [[deltaNeutralWorker.address], [workerInfos[i].WORKER_CONFIG_ADDR]],
        EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("15", "gwei"), nonce: nonce++ }
      )
    );
    console.log("✅ Done");
  }
  fileService.writeJson(TITLE, timelockTransactions);
};

export default func;
func.tags = ["DeltaNeutralMdexWorker02"];
