import { ethers } from "hardhat";
import { expect } from "chai";
import {
  ConfigurableInterestVaultConfig,
  ConfigurableInterestVaultConfig__factory,
  DeltaNeutralVault__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
  Vault,
  Vault__factory,
} from "../typechain";
import { WorkersEntity } from "../deploy/interfaces/config";
import { getConfig } from "../deploy/entities/config";
import { WorkerLikeFactory } from "../deploy/adaptors/workerlike/factory";
import { WorkerLike } from "../deploy/entities/worker-like";
import { IMultiCallService, IMultiContractCall } from "../deploy/services/multicall/interfaces";
import { Multicall2Service } from "../deploy/services/multicall/multicall2";

interface IDexRouter {
  pancakeswap: string;
  waultswap: string;
  mdex: string;
  spooky: string;
  biswap: string;
}

interface IStrategyRouterInfo {
  strategyAddress: string;
  expectedRouter: string;
}

interface ITwoSidesVaultRouterInfo {
  strategyAddress: string;
  expectedVault: string;
  expectedRouter: string;
}

async function validateTwoSidesStrategies(
  multiCallService: IMultiCallService,
  twoSidesVaultRouterInfos: Array<ITwoSidesVaultRouterInfo>
) {
  twoSidesVaultRouterInfos = twoSidesVaultRouterInfos.filter((twoSides) => twoSides.strategyAddress !== "");

  const calls = twoSidesVaultRouterInfos.reduce((accum, info) => {
    accum.push(
      {
        contract: PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory.connect(
          info.strategyAddress,
          ethers.provider
        ),
        functionName: "vault",
      },
      {
        contract: PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory.connect(
          info.strategyAddress,
          ethers.provider
        ),
        functionName: "router",
      }
    );
    return accum;
  }, [] as Array<IMultiContractCall>);

  const results = await multiCallService.multiContractCall<Array<string>>(calls);
  for (let i = 0; i < results.length; i += 2) {
    expect(results[i].toLowerCase()).to.be.eq(
      twoSidesVaultRouterInfos[i / 2].expectedVault.toLowerCase(),
      `vault mis-config on ${twoSidesVaultRouterInfos[i / 2].strategyAddress} strat`
    );
    expect(results[i + 1].toLowerCase()).to.be.eq(
      twoSidesVaultRouterInfos[i / 2].expectedRouter.toLowerCase(),
      `router mis-config on ${twoSidesVaultRouterInfos[i / 2].strategyAddress} strat`
    );
  }
}

async function validateStrategies(
  multiCallService: IMultiCallService,
  strategyRouterInfos: Array<IStrategyRouterInfo>
) {
  const calls = strategyRouterInfos.map((info) => {
    return {
      contract: PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory.connect(info.strategyAddress, ethers.provider),
      functionName: "router",
    };
  });
  const results = await multiCallService.multiContractCall<Array<string>>(calls);
  for (let i = 0; i < strategyRouterInfos.length; i++)
    expect(results[i].toLowerCase()).to.be.eq(
      strategyRouterInfos[i].expectedRouter.toLowerCase(),
      `router mis-config on ${strategyRouterInfos[i].strategyAddress} strat`
    );
}

async function validateWorker(
  vault: Vault,
  workerInfo: WorkersEntity,
  multiCallService: IMultiCallService,
  routers: IDexRouter
) {
  console.log(`> validating ${workerInfo.name}`);
  if (workerInfo.name === "BETH-ETH PancakeswapWorker") {
    console.log(`> skipping ${workerInfo.name}`);
    return;
  }
  if (workerInfo.name.includes("DeltaNeutralPancakeswapWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(
      WorkerLike.deltaNeutralPancake,
      workerInfo.address,
      multiCallService,
      ethers.provider
    );
    await workerLike.validateConfig(vault.address, await vault.token(), routers.pancakeswap, workerInfo);
  } else if (workerInfo.name.includes("PancakeswapWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(
      WorkerLike.pancake,
      workerInfo.address,
      multiCallService,
      ethers.provider
    );
    await workerLike.validateConfig(vault.address, await vault.token(), routers.pancakeswap, workerInfo);
  } else if (workerInfo.name.includes("WaultswapWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(
      WorkerLike.wault,
      workerInfo.address,
      multiCallService,
      ethers.provider
    );
    await workerLike.validateConfig(vault.address, await vault.token(), routers.waultswap, workerInfo);
  } else if (workerInfo.name.includes("CakeMaxiWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(
      WorkerLike.cakeMaxi,
      workerInfo.address,
      multiCallService,
      ethers.provider
    );
    await workerLike.validateConfig(vault.address, await vault.token(), routers.pancakeswap, workerInfo);
  } else if (workerInfo.name.includes("MdexWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(
      WorkerLike.mdex,
      workerInfo.address,
      multiCallService,
      ethers.provider
    );
    await workerLike.validateConfig(vault.address, await vault.token(), routers.mdex, workerInfo);
  } else if (workerInfo.name.includes("SpookyWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(
      WorkerLike.spooky,
      workerInfo.address,
      multiCallService,
      ethers.provider
    );
    await workerLike.validateConfig(vault.address, await vault.token(), routers.spooky, workerInfo);
  } else if (workerInfo.name.includes("TombWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(
      WorkerLike.tomb,
      workerInfo.address,
      multiCallService,
      ethers.provider
    );
    await workerLike.validateConfig(vault.address, await vault.token(), routers.spooky, workerInfo);
  } else if (workerInfo.name.includes("BiswapWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(
      WorkerLike.biswap,
      workerInfo.address,
      multiCallService,
      ethers.provider
    );
    await workerLike.validateConfig(vault.address, await vault.token(), routers.biswap, workerInfo);
  }
}

async function validateApproveAddStrategies(
  multiCallService: IMultiCallService,
  vaultConfig: ConfigurableInterestVaultConfig,
  addStrats: Array<string>
) {
  console.log(`> 🔎 validating approve add strategy`);

  const calls = addStrats.map((strat) => {
    return {
      contract: vaultConfig,
      functionName: "approvedAddStrategies",
      params: [strat],
    };
  });

  const isApproves = await multiCallService.multiContractCall<Array<boolean>>(calls);

  const isReturnFalse = isApproves.find((isApprove) => isApprove === false);
  if (isReturnFalse) throw new Error(`> ❌ some problem found in approve add strategy, please double check`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = getConfig();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const multiCall2Service = new Multicall2Service(config.MultiCall, ethers.provider);

  console.log("=== validate strats ===");
  if (chainId === 56 || chainId === 97) {
    console.log(">> Validate in BSC context");
    try {
      await validateStrategies(multiCall2Service, [
        {
          strategyAddress: config.SharedStrategies.Pancakeswap!.StrategyAddBaseTokenOnly,
          expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.Pancakeswap!.StrategyLiquidate,
          expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.Pancakeswap!.StrategyWithdrawMinimizeTrading,
          expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.Pancakeswap!.StrategyPartialCloseLiquidate,
          expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.Pancakeswap!.StrategyPartialCloseMinimizeTrading,
          expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.Waultswap!.StrategyAddBaseTokenOnly,
          expectedRouter: config.YieldSources.Waultswap!.WaultswapRouter,
        },
        {
          strategyAddress: config.SharedStrategies.Waultswap!.StrategyLiquidate,
          expectedRouter: config.YieldSources.Waultswap!.WaultswapRouter,
        },
        {
          strategyAddress: config.SharedStrategies.Waultswap!.StrategyWithdrawMinimizeTrading,
          expectedRouter: config.YieldSources.Waultswap!.WaultswapRouter,
        },
        {
          strategyAddress: config.SharedStrategies.Waultswap!.StrategyPartialCloseLiquidate,
          expectedRouter: config.YieldSources.Waultswap!.WaultswapRouter,
        },
        {
          strategyAddress: config.SharedStrategies.Waultswap!.StrategyPartialCloseMinimizeTrading,
          expectedRouter: config.YieldSources.Waultswap!.WaultswapRouter,
        },
        {
          strategyAddress: config.SharedStrategies.PancakeswapSingleAsset!.StrategyAddBaseTokenOnly,
          expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.PancakeswapSingleAsset!.StrategyLiquidate,
          expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.PancakeswapSingleAsset!.StrategyWithdrawMinimizeTrading,
          expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.PancakeswapSingleAsset!.StrategyPartialCloseLiquidate,
          expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.PancakeswapSingleAsset!.StrategyPartialCloseMinimizeTrading,
          expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.Mdex!.StrategyAddBaseTokenOnly,
          expectedRouter: config.YieldSources.Mdex!.MdexRouter,
        },
        {
          strategyAddress: config.SharedStrategies.Mdex!.StrategyLiquidate,
          expectedRouter: config.YieldSources.Mdex!.MdexRouter,
        },
        {
          strategyAddress: config.SharedStrategies.Mdex!.StrategyWithdrawMinimizeTrading,
          expectedRouter: config.YieldSources.Mdex!.MdexRouter,
        },
        {
          strategyAddress: config.SharedStrategies.Mdex!.StrategyPartialCloseLiquidate,
          expectedRouter: config.YieldSources.Mdex!.MdexRouter,
        },
        {
          strategyAddress: config.SharedStrategies.Mdex!.StrategyPartialCloseMinimizeTrading,
          expectedRouter: config.YieldSources.Mdex!.MdexRouter,
        },
        {
          strategyAddress: config.SharedStrategies.Biswap!.StrategyAddBaseTokenOnly,
          expectedRouter: config.YieldSources.Biswap!.BiswapRouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.Biswap!.StrategyLiquidate,
          expectedRouter: config.YieldSources.Biswap!.BiswapRouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.Biswap!.StrategyWithdrawMinimizeTrading,
          expectedRouter: config.YieldSources.Biswap!.BiswapRouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.Biswap!.StrategyPartialCloseLiquidate,
          expectedRouter: config.YieldSources.Biswap!.BiswapRouterV2,
        },
        {
          strategyAddress: config.SharedStrategies.Biswap!.StrategyPartialCloseMinimizeTrading,
          expectedRouter: config.YieldSources.Biswap!.BiswapRouterV2,
        },
      ]);
      console.log("> ✅ done");
    } catch (e) {
      console.log(e);
    }
  }
  if (chainId === 4002 || chainId === 250) {
    console.log(">> Validate in Fantom context");
    try {
      await validateStrategies(multiCall2Service, [
        {
          strategyAddress: config.SharedStrategies.SpookySwap!.StrategyAddBaseTokenOnly,
          expectedRouter: config.YieldSources.SpookySwap!.SpookyRouter,
        },
        {
          strategyAddress: config.SharedStrategies.SpookySwap!.StrategyLiquidate,
          expectedRouter: config.YieldSources.SpookySwap!.SpookyRouter,
        },
        {
          strategyAddress: config.SharedStrategies.SpookySwap!.StrategyWithdrawMinimizeTrading,
          expectedRouter: config.YieldSources.SpookySwap!.SpookyRouter,
        },
        {
          strategyAddress: config.SharedStrategies.SpookySwap!.StrategyPartialCloseLiquidate,
          expectedRouter: config.YieldSources.SpookySwap!.SpookyRouter,
        },
        {
          strategyAddress: config.SharedStrategies.SpookySwap!.StrategyPartialCloseMinimizeTrading,
          expectedRouter: config.YieldSources.SpookySwap!.SpookyRouter,
        },
      ]);
      console.log("> ✅ done");
    } catch (e) {
      console.log(e);
    }
  }

  for (let i = 0; i < config.Vaults.length; i++) {
    const vault = Vault__factory.connect(config.Vaults[i].address, ethers.provider);
    const vaultConfig = ConfigurableInterestVaultConfig__factory.connect(config.Vaults[i].config, ethers.provider);

    console.log("=======================");
    console.log(`> validating ${config.Vaults[i].name}`);
    console.log(`> validate vault strategies`);
    if (chainId === 56 || chainId === 97) {
      try {
        await validateTwoSidesStrategies(multiCall2Service, [
          {
            strategyAddress: config.Vaults[i].StrategyAddTwoSidesOptimal.Pancakeswap!,
            expectedVault: vault.address,
            expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
          },
          {
            strategyAddress: config.Vaults[i].StrategyAddTwoSidesOptimal.Waultswap!,
            expectedVault: vault.address,
            expectedRouter: config.YieldSources.Waultswap!.WaultswapRouter,
          },
          {
            strategyAddress: config.Vaults[i].StrategyAddTwoSidesOptimal.PancakeswapSingleAsset!,
            expectedVault: vault.address,
            expectedRouter: config.YieldSources.Pancakeswap!.RouterV2,
          },
          {
            strategyAddress: config.Vaults[i].StrategyAddTwoSidesOptimal.Mdex!,
            expectedVault: vault.address,
            expectedRouter: config.YieldSources.Mdex!.MdexRouter,
          },
          {
            strategyAddress: config.Vaults[i].StrategyAddTwoSidesOptimal.Biswap!,
            expectedVault: vault.address,
            expectedRouter: config.YieldSources.Biswap!.BiswapRouterV2,
          },
        ]);

        await validateApproveAddStrategies(multiCall2Service, vaultConfig, [
          config.SharedStrategies.Pancakeswap!.StrategyAddBaseTokenOnly,
          config.Vaults[i].StrategyAddTwoSidesOptimal.Pancakeswap!,
          config.SharedStrategies.PancakeswapSingleAsset!.StrategyAddBaseTokenOnly,
          config.Vaults[i].StrategyAddTwoSidesOptimal.PancakeswapSingleAsset!,
          config.SharedStrategies.Mdex!.StrategyAddBaseTokenOnly,
          config.Vaults[i].StrategyAddTwoSidesOptimal.Mdex!,
          config.SharedStrategies.Biswap!.StrategyAddBaseTokenOnly,
          config.Vaults[i].StrategyAddTwoSidesOptimal.Biswap!,
        ]);
        console.log("> ✅ done, no problem found");
      } catch (e) {
        console.log("> ❌ some problem found");
        console.log(e);
      }
    }
    if (chainId === 4002 || chainId === 250) {
      try {
        await validateTwoSidesStrategies(multiCall2Service, [
          {
            strategyAddress: config.Vaults[i].StrategyAddTwoSidesOptimal.SpookySwap!,
            expectedVault: vault.address,
            expectedRouter: config.YieldSources.SpookySwap!.SpookyRouter,
          },
        ]);

        await validateApproveAddStrategies(multiCall2Service, vaultConfig, [
          config.SharedStrategies.SpookySwap!.StrategyAddBaseTokenOnly,
          config.Vaults[i].StrategyAddTwoSidesOptimal.SpookySwap!,
        ]);
        console.log("> ✅ done, no problem found");
      } catch (e) {
        console.log("> ❌ some problem found");
        console.log(e);
      }
    }

    const validateWorkers = [];
    const dexRouters: IDexRouter = {
      pancakeswap: ethers.constants.AddressZero,
      waultswap: ethers.constants.AddressZero,
      mdex: ethers.constants.AddressZero,
      spooky: ethers.constants.AddressZero,
      biswap: ethers.constants.AddressZero,
    };
    if (chainId === 56 || chainId === 97) {
      dexRouters.pancakeswap = config.YieldSources.Pancakeswap!.RouterV2;
      dexRouters.waultswap = config.YieldSources.Waultswap!.WaultswapRouter;
      dexRouters.mdex = config.YieldSources.Mdex!.MdexRouter;
      dexRouters.biswap = config.YieldSources.Biswap!.BiswapRouterV2;
    }
    if (chainId === 4002 || chainId == 250) {
      dexRouters.spooky = config.YieldSources.SpookySwap!.SpookyRouter;
    }
    for (const worker of config.Vaults[i].workers) {
      validateWorkers.push(validateWorker(vault, worker, multiCall2Service, dexRouters));
    }
    await Promise.all(validateWorkers);
    await delay(3000);
  }

  console.log("=== validate delta vaults ===");
  for (let i = 0; i < config.DeltaNeutralVaults.length; i++) {
    console.log("> validting " + config.DeltaNeutralVaults[i].name);
    const deltaVault = DeltaNeutralVault__factory.connect(config.DeltaNeutralVaults[i].address, ethers.provider);

    console.log("> validate vault configuration");
    expect((await deltaVault.assetVault()).toLowerCase()).to.be.eq(
      config.DeltaNeutralVaults[i].assetVault.toLowerCase(),
      "❌ assetVault mis-match"
    );
    expect((await deltaVault.stableVault()).toLowerCase()).to.be.eq(
      config.DeltaNeutralVaults[i].stableVault.toLowerCase(),
      "❌ stableVault mis-match"
    );
    expect((await deltaVault.assetToken()).toLowerCase()).to.be.eq(
      config.DeltaNeutralVaults[i].assetToken.toLowerCase(),
      "❌ assetToken mis-match"
    );
    expect((await deltaVault.stableToken()).toLowerCase()).to.be.eq(
      config.DeltaNeutralVaults[i].stableToken.toLowerCase(),
      "❌ stableToken mis-match"
    );
    expect(await deltaVault.assetVaultPosId()).to.be.eq(
      config.DeltaNeutralVaults[i].assetVaultPosId,
      "❌ assetVaultPosId mis-match"
    );
    expect(await deltaVault.stableVaultPosId()).to.be.eq(
      config.DeltaNeutralVaults[i].stableVaultPosId,
      "❌ stableVaultPosId mis-match"
    );
    console.log("✅ done");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
