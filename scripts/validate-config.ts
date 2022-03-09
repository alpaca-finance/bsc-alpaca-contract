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

interface IDexRouter {
  pancakeswap: string;
  waultswap: string;
  mdex: string;
  spooky: string;
}

async function validateTwoSidesStrategy(strategyAddress: string, expectedVault: string, expectedRouter: string) {
  if (strategyAddress === "") {
    console.log("> ⚠️ no two sides strategy address provided. Is this an expected case?");
    return;
  }
  const strat = PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory.connect(strategyAddress, ethers.provider);
  expect(await strat.vault()).to.be.eq(expectedVault, `vault mis-config on ${strategyAddress} strat`);
  expect(await strat.router()).to.be.eq(expectedRouter, `router mis-config on ${strategyAddress} strat`);
}

async function validateStrategy(strategyAddress: string, expectedRouter: string) {
  const strat = PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory.connect(strategyAddress, ethers.provider);
  expect(await strat.router()).to.be.eq(expectedRouter, `router mis-config on ${strategyAddress} strat`);
}

async function validateWorker(vault: Vault, workerInfo: WorkersEntity, routers: IDexRouter) {
  console.log(`> validating ${workerInfo.name}`);
  if (workerInfo.name.includes("DeltaNeutralPancakeswapWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(
      WorkerLike.deltaNeutralPancake,
      workerInfo.address,
      ethers.provider
    );
    await workerLike.validateConfig(vault.address, await vault.token(), routers.pancakeswap, workerInfo);
  } else if (workerInfo.name.includes("PancakeswapWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(WorkerLike.pancake, workerInfo.address, ethers.provider);
    await workerLike.validateConfig(vault.address, await vault.token(), routers.pancakeswap, workerInfo);
  } else if (workerInfo.name.includes("WaultswapWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(WorkerLike.wault, workerInfo.address, ethers.provider);
    await workerLike.validateConfig(vault.address, await vault.token(), routers.waultswap, workerInfo);
  } else if (workerInfo.name.includes("CakeMaxiWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(WorkerLike.cakeMaxi, workerInfo.address, ethers.provider);
    await workerLike.validateConfig(vault.address, await vault.token(), routers.pancakeswap, workerInfo);
  } else if (workerInfo.name.includes("MdexWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(WorkerLike.mdex, workerInfo.address, ethers.provider);
    await workerLike.validateConfig(vault.address, await vault.token(), routers.mdex, workerInfo);
  } else if (workerInfo.name.includes("SpookyWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(WorkerLike.spooky, workerInfo.address, ethers.provider);
    await workerLike.validateConfig(vault.address, await vault.token(), routers.spooky, workerInfo);
  } else if (workerInfo.name.includes("TombWorker")) {
    const workerLike = WorkerLikeFactory.newWorkerLike(WorkerLike.tomb, workerInfo.address, ethers.provider);
    await workerLike.validateConfig(vault.address, await vault.token(), routers.spooky, workerInfo);
  }
}

async function validateApproveAddStrategy(vaultConfig: ConfigurableInterestVaultConfig, addStrats: Array<string>) {
  console.log(`> 🔎 validating approve add strategy`);
  const promises = [];
  for (let i = 0; i < addStrats.length; i++) promises.push(vaultConfig.approvedAddStrategies(addStrats[i]));
  const isApproves = await Promise.all(promises);

  const isReturnFalse = isApproves.find((isApprove) => isApprove === false);
  if (isReturnFalse) {
    console.log(`> ❌ some problem found in approve add strategy, please double check`);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = getConfig();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("=== validate strats ===");
  if (chainId === 56 || chainId === 97) {
    console.log(">> Validate in BSC context");
    try {
      await Promise.all([
        validateStrategy(
          config.SharedStrategies.Pancakeswap!.StrategyAddBaseTokenOnly,
          config.YieldSources.Pancakeswap!.RouterV2
        ),
        validateStrategy(
          config.SharedStrategies.Pancakeswap!.StrategyLiquidate,
          config.YieldSources.Pancakeswap!.RouterV2
        ),
        validateStrategy(
          config.SharedStrategies.Pancakeswap!.StrategyWithdrawMinimizeTrading,
          config.YieldSources.Pancakeswap!.RouterV2
        ),
        validateStrategy(
          config.SharedStrategies.Pancakeswap!.StrategyPartialCloseLiquidate,
          config.YieldSources.Pancakeswap!.RouterV2
        ),
        validateStrategy(
          config.SharedStrategies.Pancakeswap!.StrategyPartialCloseMinimizeTrading,
          config.YieldSources.Pancakeswap!.RouterV2
        ),
        validateStrategy(
          config.SharedStrategies.Waultswap!.StrategyAddBaseTokenOnly,
          config.YieldSources.Waultswap!.WaultswapRouter
        ),
        validateStrategy(
          config.SharedStrategies.Waultswap!.StrategyLiquidate,
          config.YieldSources.Waultswap!.WaultswapRouter
        ),
        validateStrategy(
          config.SharedStrategies.Waultswap!.StrategyWithdrawMinimizeTrading,
          config.YieldSources.Waultswap!.WaultswapRouter
        ),
        validateStrategy(
          config.SharedStrategies.Waultswap!.StrategyPartialCloseLiquidate,
          config.YieldSources.Waultswap!.WaultswapRouter
        ),
        validateStrategy(
          config.SharedStrategies.Waultswap!.StrategyPartialCloseMinimizeTrading,
          config.YieldSources.Waultswap!.WaultswapRouter
        ),
        validateStrategy(config.SharedStrategies.Mdex!.StrategyAddBaseTokenOnly, config.YieldSources.Mdex!.MdexRouter),
        validateStrategy(config.SharedStrategies.Mdex!.StrategyLiquidate, config.YieldSources.Mdex!.MdexRouter),
        validateStrategy(
          config.SharedStrategies.Mdex!.StrategyPartialCloseLiquidate,
          config.YieldSources.Mdex!.MdexRouter
        ),
        validateStrategy(
          config.SharedStrategies.Mdex!.StrategyPartialCloseMinimizeTrading,
          config.YieldSources.Mdex!.MdexRouter
        ),
        validateStrategy(
          config.SharedStrategies.Mdex!.StrategyWithdrawMinimizeTrading,
          config.YieldSources.Mdex!.MdexRouter
        ),
      ]);
      console.log("> ✅ done");
    } catch (e) {
      console.log(e);
    }
  }
  if (chainId === 4002 || chainId === 250) {
    console.log(">> Validate in Fantom context");
    try {
      await Promise.all([
        validateStrategy(
          config.SharedStrategies.SpookySwap!.StrategyAddBaseTokenOnly,
          config.YieldSources.SpookySwap!.SpookyRouter
        ),
        validateStrategy(
          config.SharedStrategies.SpookySwap!.StrategyLiquidate,
          config.YieldSources.SpookySwap!.SpookyRouter
        ),
        validateStrategy(
          config.SharedStrategies.SpookySwap!.StrategyWithdrawMinimizeTrading,
          config.YieldSources.SpookySwap!.SpookyRouter
        ),
        validateStrategy(
          config.SharedStrategies.SpookySwap!.StrategyPartialCloseLiquidate,
          config.YieldSources.SpookySwap!.SpookyRouter
        ),
        validateStrategy(
          config.SharedStrategies.SpookySwap!.StrategyPartialCloseMinimizeTrading,
          config.YieldSources.SpookySwap!.SpookyRouter
        ),
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
        await Promise.all([
          validateTwoSidesStrategy(
            config.Vaults[i].StrategyAddTwoSidesOptimal.Pancakeswap!,
            vault.address,
            config.YieldSources.Pancakeswap!.RouterV2
          ),
          validateTwoSidesStrategy(
            config.Vaults[i].StrategyAddTwoSidesOptimal.Waultswap!,
            vault.address,
            config.YieldSources.Waultswap!.WaultswapRouter
          ),
          validateTwoSidesStrategy(
            config.Vaults[i].StrategyAddTwoSidesOptimal.PancakeswapSingleAsset!,
            vault.address,
            config.YieldSources.Pancakeswap!.RouterV2
          ),
          validateTwoSidesStrategy(
            config.Vaults[i].StrategyAddTwoSidesOptimal.Mdex!,
            vault.address,
            config.YieldSources.Mdex!.MdexRouter
          ),
        ]);

        validateApproveAddStrategy(vaultConfig, [
          config.SharedStrategies.Pancakeswap!.StrategyAddBaseTokenOnly,
          config.Vaults[i].StrategyAddTwoSidesOptimal.Pancakeswap!,
          config.SharedStrategies.PancakeswapSingleAsset!.StrategyAddBaseTokenOnly,
          config.Vaults[i].StrategyAddTwoSidesOptimal.PancakeswapSingleAsset!,
          config.SharedStrategies.Mdex!.StrategyAddBaseTokenOnly,
          config.Vaults[i].StrategyAddTwoSidesOptimal.Mdex!,
        ]);
        console.log("> ✅ done, no problem found");
      } catch (e) {
        console.log("> ❌ some problem found");
        console.log(e);
      }
    }
    if (chainId === 4002 || chainId === 250) {
      try {
        await Promise.all([
          validateTwoSidesStrategy(
            config.Vaults[i].StrategyAddTwoSidesOptimal.SpookySwap!,
            vault.address,
            config.YieldSources.SpookySwap!.SpookyRouter
          ),
        ]);

        validateApproveAddStrategy(vaultConfig, [
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
    };
    if (chainId === 56 || chainId === 97) {
      dexRouters.pancakeswap = config.YieldSources.Pancakeswap!.RouterV2;
      dexRouters.waultswap = config.YieldSources.Waultswap!.WaultswapRouter;
      dexRouters.mdex = config.YieldSources.Mdex!.MdexRouter;
    }
    if (chainId === 4002 || chainId == 250) {
      dexRouters.spooky = config.YieldSources.SpookySwap!.SpookyRouter;
    }
    for (const worker of config.Vaults[i].workers) {
      validateWorkers.push(validateWorker(vault, worker, dexRouters));
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
