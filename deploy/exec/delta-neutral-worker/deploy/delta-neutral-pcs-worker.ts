import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import {
  DeltaNeutralPancakeWorker02,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
} from "../../../../typechain";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { BlockScanGasPrice } from "../../../services/gas-price/blockscan";
import { UpgradeableContractDeployer } from "../../../deployer";
import { WorkersEntity } from "../../../interfaces/config";
import { ConfigFileHelper } from "../../../helper";

interface IBeneficialVaultInput {
  BENEFICIAL_VAULT_BPS: string;
  BENEFICIAL_VAULT_ADDRESS: string;
  REWARD_PATH: Array<string>;
}

interface IDeltaNeutralPCSWorkerInput {
  VAULT_SYMBOL: string;
  WORKER_NAME: string;
  REINVEST_BOT: string;
  POOL_ID: number;
  REINVEST_BOUNTY_BPS: string;
  REINVEST_PATH: Array<string>;
  REINVEST_THRESHOLD: string;
  BENEFICIAL_VAULT?: IBeneficialVaultInput;
  WORK_FACTOR: string;
  KILL_FACTOR: string;
  MAX_PRICE_DIFF: string;
}

interface IDeltaNeutralPCSWorkerInfo {
  WORKER_NAME: string;
  VAULT_CONFIG_ADDR: string;
  WORKER_CONFIG_ADDR: string;
  REINVEST_BOT: string;
  POOL_ID: number;
  VAULT_ADDR: string;
  BASE_TOKEN_ADDR: string;
  DELTA_NEUTRAL_ORACLE: string;
  MASTER_CHEF: string;
  PCS_ROUTER_ADDR: string;
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
  const configFileHelper = new ConfigFileHelper();
  let config = ConfigEntity.getConfig();

  const shortWorkerInfos: IDeltaNeutralPCSWorkerInput[] = [
    {
      VAULT_SYMBOL: "ibWBNB",
      WORKER_NAME: "BUSD-WBNB L3x PCS1 DeltaNeutralPancakeswapWorker",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 3,
      REINVEST_BOUNTY_BPS: "1500",
      REINVEST_PATH: ["CAKE", "WBNB"],
      REINVEST_THRESHOLD: "0",
      BENEFICIAL_VAULT: {
        BENEFICIAL_VAULT_BPS: "5333",
        BENEFICIAL_VAULT_ADDRESS: "0x08B5A95cb94f926a8B620E87eE92e675b35afc7E",
        REWARD_PATH: ["CAKE", "BUSD"],
      },
      WORK_FACTOR: "8000",
      KILL_FACTOR: "0",
      MAX_PRICE_DIFF: "10500",
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      WORKER_NAME: "WBNB-BUSD L3x PCS1 DeltaNeutralPancakeswapWorker",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 3,
      REINVEST_BOUNTY_BPS: "1500",
      REINVEST_PATH: ["CAKE", "BUSD"],
      REINVEST_THRESHOLD: "0",
      BENEFICIAL_VAULT: {
        BENEFICIAL_VAULT_BPS: "5333",
        BENEFICIAL_VAULT_ADDRESS: "0x08B5A95cb94f926a8B620E87eE92e675b35afc7E",
        REWARD_PATH: ["CAKE", "BUSD"],
      },
      WORK_FACTOR: "8000",
      KILL_FACTOR: "0",
      MAX_PRICE_DIFF: "10500",
    },
  ];
  const TITLE = "mainnet_L3x_busdwbnb_pcs1_worker";
  const EXACT_ETA = "1653537600";

  const deployer = (await ethers.getSigners())[0];
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const ts = Math.floor(Date.now() / 1000);
  const gasPriceService = new BlockScanGasPrice(network.name);
  const gasPrice = await gasPriceService.getFastGasPrice();
  const workerInfos: IDeltaNeutralPCSWorkerInfo[] = shortWorkerInfos.map((n) => {
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
      DELTA_NEUTRAL_ORACLE: config.Oracle.DeltaNeutralOracle!,
      MASTER_CHEF: config.YieldSources.PancakeswapMasterChefV2!.MasterChefV2,
      PCS_ROUTER_ADDR: config.YieldSources.PancakeswapMasterChefV2!.RouterV2,
      ADD_STRAT_ADDR: config.SharedStrategies.Pancakeswap!.StrategyAddBaseTokenOnly,
      LIQ_STRAT_ADDR: config.SharedStrategies.Pancakeswap!.StrategyLiquidate,
      TWO_SIDES_STRAT_ADDR: vault.StrategyAddTwoSidesOptimal.Pancakeswap!,
      PARTIAL_CLOSE_LIQ_STRAT_ADDR: config.SharedStrategies.Pancakeswap!.StrategyPartialCloseLiquidate,
      PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR: config.SharedStrategies.Pancakeswap!.StrategyPartialCloseMinimizeTrading,
      MINIMIZE_TRADE_STRAT_ADDR: config.SharedStrategies.Pancakeswap!.StrategyWithdrawMinimizeTrading,
      REINVEST_BOUNTY_BPS: n.REINVEST_BOUNTY_BPS,
      REINVEST_PATH: reinvestPath,
      REINVEST_THRESHOLD: ethers.utils.parseEther(n.REINVEST_THRESHOLD).toString(),
      WORK_FACTOR: n.WORK_FACTOR,
      KILL_FACTOR: n.KILL_FACTOR,
      MAX_PRICE_DIFF: n.MAX_PRICE_DIFF,
      BENEFICIAL_VAULT: beneficialVault,
      TIMELOCK: config.Timelock,
    };
  });
  for (let i = 0; i < workerInfos.length; i++) {
    const deltaNeutralWorkerDeployer = new UpgradeableContractDeployer<DeltaNeutralPancakeWorker02>(
      deployer,
      "DeltaNeutralPancakeMCV2Worker02",
      workerInfos[i].WORKER_NAME
    );
    const { contract: deltaNeutralWorker, deployedBlock } = await deltaNeutralWorkerDeployer.deploy([
      workerInfos[i].VAULT_ADDR,
      workerInfos[i].BASE_TOKEN_ADDR,
      workerInfos[i].MASTER_CHEF,
      workerInfos[i].PCS_ROUTER_ADDR,
      workerInfos[i].POOL_ID,
      workerInfos[i].ADD_STRAT_ADDR,
      workerInfos[i].REINVEST_BOUNTY_BPS,
      deployer.address,
      workerInfos[i].REINVEST_PATH,
      workerInfos[i].REINVEST_THRESHOLD,
      workerInfos[i].DELTA_NEUTRAL_ORACLE,
    ]);

    let nonce = await deployer.getTransactionCount();

    console.log(`>> Adding REINVEST_BOT`);
    await deltaNeutralWorker.setReinvestorOk([workerInfos[i].REINVEST_BOT], true, { gasPrice, nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Adding Treasuries`);
    await deltaNeutralWorker.setTreasuryConfig(workerInfos[i].REINVEST_BOT, workerInfos[i].REINVEST_BOUNTY_BPS, {
      gasPrice,
      nonce: nonce++,
    });
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    const okStrats = [
      workerInfos[i].LIQ_STRAT_ADDR,
      workerInfos[i].TWO_SIDES_STRAT_ADDR,
      workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR,
    ];

    await deltaNeutralWorker.setStrategyOk(okStrats, true, { gasPrice, nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on strats`);
    const allOkStrats = [workerInfos[i].ADD_STRAT_ADDR, ...okStrats];
    for (let idx = 0; idx < allOkStrats.length; idx++) {
      const stratAddress = allOkStrats[idx];
      const contractFactory = PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory.connect(stratAddress, deployer);
      await contractFactory.setWorkersOk([deltaNeutralWorker.address], true, { nonce: nonce++ });
    }
    console.log("✅ Done");

    if (workerInfos[i].BENEFICIAL_VAULT !== undefined) {
      console.log(`>> setting beneficial vault`);
      await deltaNeutralWorker.setBeneficialVaultConfig(
        workerInfos[i].BENEFICIAL_VAULT!.BENEFICIAL_VAULT_BPS,
        workerInfos[i].BENEFICIAL_VAULT!.BENEFICIAL_VAULT_ADDRESS,
        workerInfos[i].BENEFICIAL_VAULT!.REWARD_PATH,
        { gasPrice, nonce: nonce++ }
      );
      console.log("✅ Done");
    }

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
        { gasPrice, nonce: nonce++ }
      )
    );
    console.log("✅ Done");
    fileService.writeJson(`${ts}_${TITLE}`, timelockTransactions);

    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `>> Queue tx on Timelock Linking VaultConfig with WorkerConfig via Timelock for ${workerInfos[i].VAULT_CONFIG_ADDR}`,
        workerInfos[i].VAULT_CONFIG_ADDR,
        "0",
        "setWorkers(address[],address[])",
        ["address[]", "address[]"],
        [[deltaNeutralWorker.address], [workerInfos[i].WORKER_CONFIG_ADDR]],
        EXACT_ETA,
        { gasPrice, nonce: nonce++ }
      )
    );
    console.log("✅ Done");
    fileService.writeJson(`${ts}_${TITLE}`, timelockTransactions);

    // update config file
    const lpPoolAddress = config.YieldSources.PancakeswapMasterChefV2!.pools.find(
      (pool) => pool.pId === workerInfos[i].POOL_ID
    )!.address;

    const pcsWorkersEntity: WorkersEntity = {
      name: workerInfos[i].WORKER_NAME,
      address: deltaNeutralWorker.address,
      deployedBlock,
      config: workerInfos[i].WORKER_CONFIG_ADDR,
      pId: workerInfos[i].POOL_ID,
      stakingToken: lpPoolAddress,
      stakingTokenAt: workerInfos[i].MASTER_CHEF,
      strategies: {
        StrategyAddAllBaseToken: workerInfos[i].ADD_STRAT_ADDR,
        StrategyLiquidate: workerInfos[i].LIQ_STRAT_ADDR,
        StrategyAddTwoSidesOptimal: workerInfos[i].TWO_SIDES_STRAT_ADDR,
        StrategyWithdrawMinimizeTrading: workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
        StrategyPartialCloseLiquidate: workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR,
        StrategyPartialCloseMinimizeTrading: workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR,
      },
    };

    config = configFileHelper.addOrSetVaultWorker(workerInfos[i].VAULT_ADDR, pcsWorkersEntity);
  }
};

export default func;
func.tags = ["DeltaNeutralPCSWorker02"];
