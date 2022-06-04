import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import {
  ConfigurableInterestVaultConfig__factory,
  ISwapPairLike__factory,
  MasterChefV2__factory,
  MockERC20__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  WorkerConfig__factory,
} from "../../../../typechain";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { UpgradeableContractDeployer } from "../../../deployer";
import { fileService, TimelockService } from "../../../services";
import { ConfigFileHelper } from "../../../helper";
import { WorkersEntity } from "../../../interfaces/config";
import { compare } from "../../../../utils/address";

interface IBeneficialVaultInput {
  BENEFICIAL_VAULT_BPS: string;
  BENEFICIAL_VAULT_ADDRESS: string;
  REWARD_PATH: Array<string>;
}

interface IPancakeswapWorkerInput {
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

interface IPancakeswapWorkerInfo {
  WORKER_NAME: string;
  VAULT_CONFIG_ADDR: string;
  WORKER_CONFIG_ADDR: string;
  REINVEST_BOT: string;
  POOL_ID: number;
  VAULT_ADDR: string;
  BASE_TOKEN_ADDR: string;
  MASTER_CHEF_ADDR: string;
  PANCAKESWAP_ROUTER_ADDR: string;
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
  const executeFileTitle = "pcs-cake-pools";
  const shortWorkerInfos: IPancakeswapWorkerInput[] = [
    {
      VAULT_SYMBOL: "ibCAKE",
      WORKER_NAME: "BUSD-CAKE PancakeswapWorker",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 39,
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_PATH: ["CAKE"],
      REINVEST_THRESHOLD: "0",
      BENEFICIAL_VAULT: {
        BENEFICIAL_VAULT_ADDRESS: "0x08B5A95cb94f926a8B620E87eE92e675b35afc7E",
        REWARD_PATH: ["CAKE", "BUSD"],
        BENEFICIAL_VAULT_BPS: "5555",
      },
      WORK_FACTOR: "7000",
      KILL_FACTOR: "8333",
      MAX_PRICE_DIFF: "10500",
      EXACT_ETA: "1654146900",
    },
    {
      VAULT_SYMBOL: "ibCAKE",
      WORKER_NAME: "WBNB-CAKE PancakeswapWorker",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 2,
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_PATH: ["CAKE"],
      REINVEST_THRESHOLD: "0",
      BENEFICIAL_VAULT: {
        BENEFICIAL_VAULT_ADDRESS: "0x08B5A95cb94f926a8B620E87eE92e675b35afc7E",
        REWARD_PATH: ["CAKE", "BUSD"],
        BENEFICIAL_VAULT_BPS: "5555",
      },
      WORK_FACTOR: "7000",
      KILL_FACTOR: "8333",
      MAX_PRICE_DIFF: "10500",
      EXACT_ETA: "1654146900",
    },
    {
      VAULT_SYMBOL: "ibCAKE",
      WORKER_NAME: "USDT-CAKE PancakeswapWorker",
      REINVEST_BOT: "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De",
      POOL_ID: 47,
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_PATH: ["CAKE"],
      REINVEST_THRESHOLD: "0",
      BENEFICIAL_VAULT: {
        BENEFICIAL_VAULT_ADDRESS: "0x08B5A95cb94f926a8B620E87eE92e675b35afc7E",
        REWARD_PATH: ["CAKE", "BUSD"],
        BENEFICIAL_VAULT_BPS: "5555",
      },
      WORK_FACTOR: "7000",
      KILL_FACTOR: "8333",
      MAX_PRICE_DIFF: "10500",
      EXACT_ETA: "1654146900",
    },
  ];

  const [deployer] = await ethers.getSigners();
  const configFileHelper = new ConfigFileHelper();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  let config = ConfigEntity.getConfig();

  const workerInfos: IPancakeswapWorkerInfo[] = shortWorkerInfos.map((n) => {
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
      MASTER_CHEF_ADDR: config.YieldSources.PancakeswapMasterChefV2!.MasterChefV2,
      PANCAKESWAP_ROUTER_ADDR: config.YieldSources.PancakeswapMasterChefV2!.RouterV2,
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
      EXACT_ETA: n.EXACT_ETA,
    };
  });

  for (let i = 0; i < workerInfos.length; i++) {
    const pancakeswapV2Worker02MCv2Deployer = new UpgradeableContractDeployer(
      deployer,
      "PancakeswapV2MCV2Worker02",
      workerInfos[i].WORKER_NAME
    );

    const { contract: pancakeswapV2Worker02, deployedBlock } = await pancakeswapV2Worker02MCv2Deployer.deploy([
      workerInfos[i].VAULT_ADDR,
      workerInfos[i].BASE_TOKEN_ADDR,
      workerInfos[i].MASTER_CHEF_ADDR,
      workerInfos[i].PANCAKESWAP_ROUTER_ADDR,
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
    await pancakeswapV2Worker02.setReinvestorOk([workerInfos[i].REINVEST_BOT], true, { nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Adding Strategies`);
    const okStrats = [
      workerInfos[i].TWO_SIDES_STRAT_ADDR,
      workerInfos[i].MINIMIZE_TRADE_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_LIQ_STRAT_ADDR,
      workerInfos[i].PARTIAL_CLOSE_MINIMIZE_STRAT_ADDR,
    ];
    await pancakeswapV2Worker02.setStrategyOk(okStrats, true, { nonce: nonce++ });
    console.log("✅ Done");

    console.log(`>> Whitelisting a worker on strats`);
    const allOkStrats = [workerInfos[i].ADD_STRAT_ADDR, workerInfos[i].LIQ_STRAT_ADDR, ...okStrats];
    for (let idx = 0; idx < allOkStrats.length; idx++) {
      const stratAddress = allOkStrats[idx];
      // NOTE: all BiswapStrategy have the same signature of func setWorkersOk.
      //       then we can use any BiswapStrategy factory for all BiswapStrategy addresses
      const contractFactory = PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory.connect(stratAddress, deployer);
      await contractFactory.setWorkersOk([pancakeswapV2Worker02.address], true, { nonce: nonce++ });
    }
    console.log("✅ Done");

    if (workerInfos[i].BENEFICIAL_VAULT) {
      console.log(">> config baneficial vault");
      await pancakeswapV2Worker02.setBeneficialVaultConfig(
        workerInfos[i].BENEFICIAL_VAULT!.BENEFICIAL_VAULT_BPS,
        workerInfos[i].BENEFICIAL_VAULT!.BENEFICIAL_VAULT_ADDRESS,
        workerInfos[i].BENEFICIAL_VAULT!.REWARD_PATH,
        { nonce: nonce++ }
      );
      console.log("✅ Done");
    }
    const workerConfig = WorkerConfig__factory.connect(workerInfos[i].WORKER_CONFIG_ADDR, deployer);
    const vaultConfig = ConfigurableInterestVaultConfig__factory.connect(workerInfos[i].VAULT_CONFIG_ADDR, deployer);

    const [workerOwnerAddress, vaultOwnerAddress] = await Promise.all([workerConfig.owner(), vaultConfig.owner()]);

    if (compare(workerOwnerAddress, config.Timelock)) {
      const setConfigsTx = await TimelockService.queueTransaction(
        `>> Queue tx on Timelock Setting WorkerConfig via Timelock at ${workerInfos[i].WORKER_CONFIG_ADDR} for ${pancakeswapV2Worker02.address} ETA ${workerInfos[i].EXACT_ETA}`,
        workerInfos[i].WORKER_CONFIG_ADDR,
        "0",
        "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
        ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
        [
          [pancakeswapV2Worker02.address],
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
          [pancakeswapV2Worker02.address],
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

    if (compare(vaultOwnerAddress, config.Timelock)) {
      const setWorkersTx = await TimelockService.queueTransaction(
        `>> Queue tx on Timelock Linking VaultConfig with WorkerConfig via Timelock for ${workerInfos[i].VAULT_CONFIG_ADDR}`,
        workerInfos[i].VAULT_CONFIG_ADDR,
        "0",
        "setWorkers(address[],address[])",
        ["address[]", "address[]"],
        [[pancakeswapV2Worker02.address], [workerInfos[i].WORKER_CONFIG_ADDR]],
        workerInfos[i].EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("15", "gwei"), nonce: nonce++ }
      );
      timelockTransactions.push(setWorkersTx);
      fileService.writeJson(executeFileTitle, timelockTransactions);
      console.log("✅ Done");
    } else {
      console.log(">> Linking VaultConfig with WorkerConfig");
      (
        await vaultConfig.setWorkers([pancakeswapV2Worker02.address], [workerInfos[i].WORKER_CONFIG_ADDR], {
          nonce: nonce++,
        })
      ).wait(3);
      console.log("✅ Done");
    }

    const masterChef = MasterChefV2__factory.connect(workerInfos[i].MASTER_CHEF_ADDR, deployer);
    const lpTokenAddress = await masterChef.lpToken(workerInfos[i].POOL_ID);

    if (
      config.YieldSources.PancakeswapMasterChefV2!.pools.find((pool) => pool.pId === workerInfos[i].POOL_ID) ===
      undefined
    ) {
      const token0 = MockERC20__factory.connect(
        await ISwapPairLike__factory.connect(lpTokenAddress, deployer).token0(),
        deployer
      );
      const token1 = MockERC20__factory.connect(
        await ISwapPairLike__factory.connect(lpTokenAddress, deployer).token1(),
        deployer
      );
      config = configFileHelper.addOrSetYielPool("PancakeswapMasterChefV2", {
        pId: workerInfos[i].POOL_ID,
        name: `${await token0.symbol()}-${await token1.symbol()} LP`,
        address: lpTokenAddress,
      });
    }

    const workersEntity: WorkersEntity = {
      name: workerInfos[i].WORKER_NAME,
      address: pancakeswapV2Worker02.address,
      deployedBlock: deployedBlock,
      config: workerInfos[i].WORKER_CONFIG_ADDR,
      pId: workerInfos[i].POOL_ID,
      stakingToken: lpTokenAddress,
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

    config = configFileHelper.addOrSetVaultWorker(workerInfos[i].VAULT_ADDR, workersEntity);
  }
};

export default func;
func.tags = ["PancakeswapWorkers02"];
