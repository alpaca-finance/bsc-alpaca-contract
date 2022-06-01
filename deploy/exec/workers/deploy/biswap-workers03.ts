import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  ConfigurableInterestVaultConfig__factory,
  BiswapStrategyAddBaseTokenOnly__factory,
  BiswapWorker03,
  Timelock__factory,
  WorkerConfig__factory,
  BiswapMasterChef__factory,
  MockERC20__factory,
  ISwapPairLike__factory,
} from "../../../../typechain";
import { TimelockEntity } from "../../../entities";
import { WorkersEntity } from "../../../interfaces/config";
import { compare } from "../../../../utils/address";
import { getDeployer } from "../../../../utils/deployer-helper";
import { fileService, TimelockService } from "../../../services";
import { UpgradeableContractDeployer } from "../../../deployer";
import { ConfigFileHelper } from "../../../helper";

interface IBeneficialVaultInput {
  BENEFICIAL_VAULT_BPS: string;
  BENEFICIAL_VAULT_ADDRESS: string;
  REWARD_PATH: Array<string>;
}

interface IBiswapWorkerInput {
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

interface IBiswapWorkerInfo {
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
  const executeFileTitle = "biswap-wbnbusdc-usdcwbnb-pool";
  const shortWorkerInfos: IBiswapWorkerInput[] = [
    {
      VAULT_SYMBOL: "ibUSDC",
      WORKER_NAME: "WBNB-USDC BiswapWorker",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 119,
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_PATH: ["BSW", "USDT", "USDC"],
      REINVEST_THRESHOLD: "0",
      BENEFICIAL_VAULT: {
        BENEFICIAL_VAULT_ADDRESS: "0x08B5A95cb94f926a8B620E87eE92e675b35afc7E",
        REWARD_PATH: ["BSW", "USDT", "BUSD"],
        BENEFICIAL_VAULT_BPS: "5555",
      },
      WORK_FACTOR: "7000",
      KILL_FACTOR: "8333",
      MAX_PRICE_DIFF: "10500",
      EXACT_ETA: "1653966000",
    },
    {
      VAULT_SYMBOL: "ibWBNB",
      WORKER_NAME: "USDC-WBNB BiswapWorker",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 119,
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_PATH: ["BSW", "WBNB"],
      REINVEST_THRESHOLD: "0",
      BENEFICIAL_VAULT: {
        BENEFICIAL_VAULT_ADDRESS: "0x08B5A95cb94f926a8B620E87eE92e675b35afc7E",
        REWARD_PATH: ["BSW", "USDT", "BUSD"],
        BENEFICIAL_VAULT_BPS: "5555",
      },
      WORK_FACTOR: "7000",
      KILL_FACTOR: "8333",
      MAX_PRICE_DIFF: "10500",
      EXACT_ETA: "1653966000",
    },
  ];

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  const deployer = await getDeployer();

  const timestamp = Math.floor(new Date().getTime() / 1000);
  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  const workerInfos: IBiswapWorkerInfo[] = shortWorkerInfos.map((n) => {
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
      MASTER_CHEF_ADDR: config.YieldSources.Biswap!.MasterChef,
      ROUTER_ADDR: config.YieldSources.Biswap!.BiswapRouterV2,
      ADD_STRAT_ADDR: config.SharedStrategies.Biswap!.StrategyAddBaseTokenOnly,
      LIQ_STRAT_ADDR: config.SharedStrategies.Biswap!.StrategyLiquidate,
      TWO_SIDES_STRAT_ADDR: vault.StrategyAddTwoSidesOptimal.Biswap!,
      PARTIAL_CLOSE_LIQ_STRAT_ADDR: config.SharedStrategies.Biswap!.StrategyPartialCloseLiquidate,
      PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR: config.SharedStrategies.Biswap!.StrategyPartialCloseMinimizeTrading,
      MINIMIZE_TRADE_STRAT_ADDR: config.SharedStrategies.Biswap!.StrategyWithdrawMinimizeTrading,
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
    const biswapWorker03Deployer = new UpgradeableContractDeployer<BiswapWorker03>(
      deployer,
      "BiswapWorker03",
      workerInfos[i].WORKER_NAME
    );

    const { contract: biswapWorker03, deployedBlock } = await biswapWorker03Deployer.deploy([
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

    let nonce = await deployer.getTransactionCount();

    console.log(`>> Adding REINVEST_BOT`);
    await biswapWorker03.setReinvestorOk([workerInfos[i].REINVEST_BOT], true, { nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    const okStrats = [
      workerInfos[i].TWO_SIDES_STRAT_ADDR,
      workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR,
    ];

    await biswapWorker03.setStrategyOk(okStrats, true, { nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on ok strats`);
    const allOkStrats = [workerInfos[i].ADD_STRAT_ADDR, workerInfos[i].LIQ_STRAT_ADDR, ...okStrats];

    for (const stratAddress of allOkStrats) {
      // NOTE: all BiswapStrategy have the same signature of func setWorkersOk.
      //       then we can use any BiswapStrategy factory for all BiswapStrategy addresses
      const contractFactory = BiswapStrategyAddBaseTokenOnly__factory.connect(stratAddress, deployer);
      await contractFactory.setWorkersOk([biswapWorker03.address], true, { nonce: nonce++ });
    }
    console.log("✅ Done");

    if (workerInfos[i].BENEFICIAL_VAULT) {
      console.log(">> set baneficial vault config");
      await biswapWorker03.setBeneficialVaultConfig(
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
      const setConfigsTx = await TimelockService.queueTransaction(
        `>> Queue tx on Timelock Setting WorkerConfig via Timelock at ${workerInfos[i].WORKER_CONFIG_ADDR} for ${biswapWorker03.address} ETA ${workerInfos[i].EXACT_ETA}`,
        workerInfos[i].WORKER_CONFIG_ADDR,
        "0",
        "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
        ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
        [
          [biswapWorker03.address],
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
      fileService.writeJson(`${timestamp}_${executeFileTitle}`, timelockTransactions);
      console.log("✅ Done");
    } else {
      console.log(">> Setting WorkerConfig");
      (
        await workerConfig.setConfigs(
          [biswapWorker03.address],
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
        [[biswapWorker03.address], [workerInfos[i].WORKER_CONFIG_ADDR]],
        workerInfos[i].EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("15", "gwei"), nonce: nonce++ }
      );
      timelockTransactions.push(setWorkersTx);
      fileService.writeJson(`${timestamp}_${executeFileTitle}`, timelockTransactions);
      console.log("✅ Done");
    } else {
      console.log(">> Linking VaultConfig with WorkerConfig");
      (
        await vaultConfig.setWorkers([biswapWorker03.address], [workerInfos[i].WORKER_CONFIG_ADDR], {
          nonce: nonce++,
        })
      ).wait(3);
      console.log("✅ Done");
    }

    const biswapMasterChef = BiswapMasterChef__factory.connect(workerInfos[i].MASTER_CHEF_ADDR, deployer);
    const poolInfo = await biswapMasterChef.poolInfo(workerInfos[i].POOL_ID);

    if (config.YieldSources.Biswap!.pools.find((pool) => pool.pId === workerInfos[i].POOL_ID) === undefined) {
      const token0 = MockERC20__factory.connect(
        await ISwapPairLike__factory.connect(poolInfo.lpToken, deployer).token0(),
        deployer
      );
      const token1 = MockERC20__factory.connect(
        await ISwapPairLike__factory.connect(poolInfo.lpToken, deployer).token1(),
        deployer
      );
      config = configFileHelper.addOrSetYielPool("Biswap", {
        pId: workerInfos[i].POOL_ID,
        name: `${await token0.symbol()}-${await token1.symbol()} LP`,
        address: poolInfo.lpToken,
      });
    }

    const biswapWorkersEntity: WorkersEntity = {
      name: workerInfos[i].WORKER_NAME,
      address: biswapWorker03.address,
      deployedBlock: deployedBlock,
      config: workerInfos[i].WORKER_CONFIG_ADDR,
      pId: workerInfos[i].POOL_ID,
      stakingToken: poolInfo.lpToken,
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
func.tags = ["BiswapWorker03"];
