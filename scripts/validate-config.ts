import { ethers, network } from "hardhat";
import { expect } from "chai";
import "@openzeppelin/test-helpers";
import {
  CakeMaxiWorker__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
  PancakeswapV2Worker__factory,
  Vault,
  Vault__factory,
  WaultSwapWorker__factory,
} from "../typechain";
import MainnetConfig from "../.mainnet.json";
import TestnetConfig from "../.testnet.json";
import { WorkersEntity } from "../deploy/interfaces/config";

interface IDexRouter {
  pancakeswap: string;
  waultswap: string;
}

async function validateTwoSidesStrategy(strategyAddress: string, expectedVault: string, expectedRouter: string) {
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
  if (workerInfo.name.includes("PancakeswapWorker")) {
    const worker = PancakeswapV2Worker__factory.connect(workerInfo.address, ethers.provider);

    try {
      expect(await worker.operator()).to.be.eq(vault.address, "operator mis-config");
      expect(workerInfo.stakingToken).to.be.eq(await worker.lpToken(), "stakingToken mis-config");
      expect(workerInfo.pId).to.be.eq(await worker.pid(), "pool id mis-config");
      expect(workerInfo.stakingTokenAt).to.be.eq(await worker.masterChef(), "masterChef mis-config");
      // @notice handle BETH-ETH as it is the old version of PancakeswapWorker
      if (workerInfo.name !== "BETH-ETH PancakeswapWorker") {
        expect(await worker.router()).to.be.eq(routers.pancakeswap, "router mis-config");
        expect(await worker.fee()).to.be.eq("9975");
        expect(await worker.feeDenom()).to.be.eq("10000");
      }
      expect(await worker.baseToken()).to.be.eq(await vault.token(), "baseToken mis-config");
      expect(await worker.okStrats(workerInfo.strategies.StrategyAddAllBaseToken)).to.be.eq(
        true,
        "mis-config on add base token only strat"
      );
      expect(await worker.okStrats(workerInfo.strategies.StrategyLiquidate)).to.be.eq(
        true,
        "mis-config on liquidate strat"
      );
      expect(await worker.okStrats(workerInfo.strategies.StrategyAddTwoSidesOptimal)).to.be.eq(
        true,
        "mis-config on add two sides strat"
      );
      expect(await worker.okStrats(workerInfo.strategies.StrategyWithdrawMinimizeTrading)).to.be.eq(
        true,
        "mis-config on minimize trading strat"
      );
      if (workerInfo.strategies.StrategyPartialCloseLiquidate != "") {
        expect(await worker.okStrats(workerInfo.strategies.StrategyPartialCloseLiquidate)).to.be.eq(
          true,
          "mis-config on partial close liquidate strat"
        );
      }
      if (workerInfo.strategies.StrategyPartialCloseMinimizeTrading != "") {
        expect(await worker.okStrats(workerInfo.strategies.StrategyPartialCloseMinimizeTrading)).to.be.eq(
          true,
          "mis-config on partial close minimize"
        );
      }

      console.log(`> ✅ done validated ${workerInfo.name}, no problem found`);
    } catch (e) {
      console.log(`> ❌ some problem found in ${workerInfo.name}, please double check`);
      console.log(e);
    }
  } else if (workerInfo.name.includes("WaultswapWorker")) {
    const worker = WaultSwapWorker__factory.connect(workerInfo.address, ethers.provider);
    try {
      expect(await worker.operator()).to.be.eq(vault.address, "operator mis-config");
      expect(workerInfo.stakingToken).to.be.eq(await worker.lpToken(), "lpToken mis-config");
      expect(workerInfo.pId).to.be.eq(await worker.pid(), "pool id mis-config");
      expect(workerInfo.stakingTokenAt).to.be.eq(await worker.wexMaster(), "wexMaster mis-config");
      expect(await worker.router()).to.be.eq(routers.waultswap, "router mis-config");
      expect(await worker.baseToken()).to.be.eq(await vault.token(), "baseToken mis-config");
      expect(await worker.fee()).to.be.eq("998");
      expect(await worker.feeDenom()).to.be.eq("1000");
      expect(await worker.okStrats(workerInfo.strategies.StrategyAddAllBaseToken)).to.be.eq(
        true,
        "mis-config on add base token only strat"
      );
      expect(await worker.okStrats(workerInfo.strategies.StrategyLiquidate)).to.be.eq(
        true,
        "mis-config on liquidate strat"
      );
      expect(await worker.okStrats(workerInfo.strategies.StrategyAddTwoSidesOptimal)).to.be.eq(
        true,
        "mis-config on add two sides strat"
      );
      expect(await worker.okStrats(workerInfo.strategies.StrategyWithdrawMinimizeTrading)).to.be.eq(
        true,
        "mis-config on minimize trading strat"
      );
      if (workerInfo.strategies.StrategyPartialCloseLiquidate != "") {
        expect(await worker.okStrats(workerInfo.strategies.StrategyPartialCloseLiquidate)).to.be.eq(
          true,
          "mis-config on partial close liquidate strat"
        );
      }
      if (workerInfo.strategies.StrategyPartialCloseMinimizeTrading != "") {
        expect(await worker.okStrats(workerInfo.strategies.StrategyPartialCloseMinimizeTrading)).to.be.eq(
          true,
          "mis-config on partial close minimize"
        );
      }

      console.log(`> ✅ done validated ${workerInfo.name}, no problem found`);
    } catch (e) {
      console.log(`> ❌ some problem found in ${workerInfo.name}, please double check`);
      console.log(e);
    }
  } else if (workerInfo.name.includes("CakeMaxiWorker")) {
    const worker = CakeMaxiWorker__factory.connect(workerInfo.address, ethers.provider);
    try {
      expect(await worker.operator()).to.be.eq(vault.address, "operator mis-config");
      expect(workerInfo.stakingToken).to.be.eq(await worker.farmingToken(), "farmingToken mis-config");
      expect(workerInfo.pId).to.be.eq(await worker.pid(), "pool id mis-config");
      expect(workerInfo.stakingTokenAt).to.be.eq(await worker.masterChef(), "masterChef mis-config");
      expect(await worker.router()).to.be.eq(routers.pancakeswap, "router mis-config");
      expect(await worker.baseToken()).to.be.eq(await vault.token(), "baseToken mis-config");
      expect(await worker.fee()).to.be.eq("9975");
      expect(await worker.feeDenom()).to.be.eq("10000");
      expect(await worker.okStrats(workerInfo.strategies.StrategyAddAllBaseToken)).to.be.eq(
        true,
        "mis-config on add base token only strat"
      );
      expect(await worker.okStrats(workerInfo.strategies.StrategyLiquidate)).to.be.eq(
        true,
        "mis-config on liquidate strat"
      );
      expect(await worker.okStrats(workerInfo.strategies.StrategyAddTwoSidesOptimal)).to.be.eq(
        true,
        "mis-config on add two sides strat"
      );
      expect(await worker.okStrats(workerInfo.strategies.StrategyWithdrawMinimizeTrading)).to.be.eq(
        true,
        "mis-config on minimize trading strat"
      );
      if (workerInfo.strategies.StrategyPartialCloseLiquidate != "") {
        expect(await worker.okStrats(workerInfo.strategies.StrategyPartialCloseLiquidate)).to.be.eq(
          true,
          "mis-config on partial close liquidate strat"
        );
      }
      if (workerInfo.strategies.StrategyPartialCloseMinimizeTrading != "") {
        expect(await worker.okStrats(workerInfo.strategies.StrategyPartialCloseMinimizeTrading)).to.be.eq(
          true,
          "mis-config on partial close minimize"
        );
      }

      console.log(`> ✅ done validated ${workerInfo.name}, no problem found`);
    } catch (e) {
      console.log(`> ❌ some problem found in ${workerInfo.name}, please double check`);
      console.log(e);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;

  console.log("=== validate strats ===");
  try {
    await Promise.all([
      validateStrategy(
        config.SharedStrategies.Pancakeswap.StrategyAddBaseTokenOnly,
        config.Exchanges.Pancakeswap.RouterV2
      ),
      validateStrategy(config.SharedStrategies.Pancakeswap.StrategyLiquidate, config.Exchanges.Pancakeswap.RouterV2),
      validateStrategy(
        config.SharedStrategies.Pancakeswap.StrategyWithdrawMinimizeTrading,
        config.Exchanges.Pancakeswap.RouterV2
      ),
      validateStrategy(
        config.SharedStrategies.Pancakeswap.StrategyPartialCloseLiquidate,
        config.Exchanges.Pancakeswap.RouterV2
      ),
      validateStrategy(
        config.SharedStrategies.Pancakeswap.StrategyPartialCloseMinimizeTrading,
        config.Exchanges.Pancakeswap.RouterV2
      ),
      validateStrategy(
        config.SharedStrategies.Waultswap.StrategyAddBaseTokenOnly,
        config.Exchanges.Waultswap.WaultswapRouter
      ),
      validateStrategy(config.SharedStrategies.Waultswap.StrategyLiquidate, config.Exchanges.Waultswap.WaultswapRouter),
      validateStrategy(
        config.SharedStrategies.Waultswap.StrategyWithdrawMinimizeTrading,
        config.Exchanges.Waultswap.WaultswapRouter
      ),
      validateStrategy(
        config.SharedStrategies.Waultswap.StrategyPartialCloseLiquidate,
        config.Exchanges.Waultswap.WaultswapRouter
      ),
      validateStrategy(
        config.SharedStrategies.Waultswap.StrategyPartialCloseMinimizeTrading,
        config.Exchanges.Waultswap.WaultswapRouter
      ),
    ]);
    console.log("> ✅ done");
  } catch (e) {
    console.log(e);
  }

  for (let i = 0; i < config.Vaults.length; i++) {
    const vault = Vault__factory.connect(config.Vaults[i].address, ethers.provider);

    console.log("=======================");
    console.log(`> validating ${config.Vaults[i].name}`);
    console.log(`> validate vault strategies`);
    try {
      await Promise.all([
        validateTwoSidesStrategy(
          config.Vaults[i].StrategyAddTwoSidesOptimal.Pancakeswap,
          vault.address,
          config.Exchanges.Pancakeswap.RouterV2
        ),
        validateTwoSidesStrategy(
          config.Vaults[i].StrategyAddTwoSidesOptimal.Waultswap,
          vault.address,
          config.Exchanges.Waultswap.WaultswapRouter
        ),
        validateTwoSidesStrategy(
          config.Vaults[i].StrategyAddTwoSidesOptimal.PancakeswapSingleAsset,
          vault.address,
          config.Exchanges.Pancakeswap.RouterV2
        ),
      ]);
      console.log("> ✅ done, no problem found");
    } catch (e) {
      console.log("> ❌ some problem found");
      console.log(e);
    }

    const validateWorkers = [];
    for (const worker of config.Vaults[i].workers) {
      validateWorkers.push(
        validateWorker(vault, worker, {
          pancakeswap: config.Exchanges.Pancakeswap.RouterV2,
          waultswap: config.Exchanges.Waultswap.WaultswapRouter,
        })
      );
    }
    await Promise.all(validateWorkers);
    await delay(3000);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
