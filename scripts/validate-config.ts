import { ethers, upgrades, waffle, network } from "hardhat";
import { Overrides, Signer, BigNumberish, utils, Wallet } from "ethers";
import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  CakeMaxiWorker__factory,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
  PancakeswapV2RestrictedStrategyLiquidate__factory,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory,
  PancakeswapV2Worker__factory,
  Vault,
  Vault__factory,
  WaultSwapRestrictedStrategyAddBaseTokenOnly__factory,
  WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory,
  WaultSwapRestrictedStrategyLiquidate__factory,
  WaultSwapRestrictedStrategyWithdrawMinimizeTrading__factory,
  WaultSwapWorker,
  WaultSwapWorker__factory,
} from "../typechain";
import MainnetConfig from "../.mainnet.json";
import TestnetConfig from "../.testnet.json";
import { worker } from "node:cluster";
import { WorkersEntity } from "../deploy/interfaces/config";

interface IVaultInfo {
  name: string;
  symbol: string;
  address: string;
  debtToken: string;
  config: string;
  tripleSlopeModel: string;
  StrategyAddTwoSidesOptimal: {
    Pancakeswap: string;
    Waultswap: string;
  };
  workers: WorkersEntity[];
}

interface IDexRouter {
  pancakeswap: string;
  waultswap: string;
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
    console.log(`> validating Pancakeswap shared strats`);
    const pcsBaseTokenOnlyStrat = PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory.connect(
      config.SharedStrategies.Pancakeswap.StrategyAddBaseTokenOnly,
      ethers.provider
    );
    expect(await pcsBaseTokenOnlyStrat.router()).to.be.eq(
      config.Exchanges.Pancakeswap.RouterV2,
      "pcs add base strat router mis-config"
    );

    const pcsLiqStrat = PancakeswapV2RestrictedStrategyLiquidate__factory.connect(
      config.SharedStrategies.Pancakeswap.StrategyLiquidate,
      ethers.provider
    );
    expect(await pcsLiqStrat.router()).to.be.eq(
      config.Exchanges.Pancakeswap.RouterV2,
      "pcs liq strat router mis-config"
    );

    const pcsMinimizeTrade = PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory.connect(
      config.SharedStrategies.Pancakeswap.StrategyWithdrawMinimizeTrading,
      ethers.provider
    );
    expect(await pcsMinimizeTrade.router()).to.be.eq(
      config.Exchanges.Pancakeswap.RouterV2,
      "pcs minimize router mis-config"
    );
    console.log("> ✅ done");

    console.log(`> validating Waultswap shared strats`);
    const wswapBaseTokenOnlyStrat = WaultSwapRestrictedStrategyAddBaseTokenOnly__factory.connect(
      config.SharedStrategies.Waultswap.StrategyAddBaseTokenOnly,
      ethers.provider
    );
    expect(await wswapBaseTokenOnlyStrat.router()).to.be.eq(config.Exchanges.Waultswap.WaultswapRouter);

    const wswapLiqStrat = WaultSwapRestrictedStrategyLiquidate__factory.connect(
      config.SharedStrategies.Waultswap.StrategyLiquidate,
      ethers.provider
    );
    expect(await wswapLiqStrat.router()).to.be.eq(config.Exchanges.Waultswap.WaultswapRouter);

    const wswapMinimizeTrade = WaultSwapRestrictedStrategyWithdrawMinimizeTrading__factory.connect(
      config.SharedStrategies.Waultswap.StrategyWithdrawMinimizeTrading,
      ethers.provider
    );
    expect(await wswapMinimizeTrade.router()).to.be.eq(config.Exchanges.Waultswap.WaultswapRouter);
    console.log("> ✅ done");
  } catch (e) {
    console.log(e);
  }

  for (let i = 0; i < config.Vaults.length; i++) {
    const vault = Vault__factory.connect(config.Vaults[i].address, ethers.provider);
    const pcsTwoSides = PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory.connect(
      config.Vaults[i].StrategyAddTwoSidesOptimal.Pancakeswap,
      ethers.provider
    );
    const waultTwoSides = WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory.connect(
      config.Vaults[i].StrategyAddTwoSidesOptimal.Waultswap,
      ethers.provider
    );
    const pcsSingleTwoSides = PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory.connect(
      config.Vaults[i].StrategyAddTwoSidesOptimal.PancakeswapSingleAsset,
      ethers.provider
    );
    console.log("=======================");
    console.log(`> validating ${config.Vaults[i].name}`);
    try {
      expect(await vault.owner()).to.be.eq(config.Timelock, "vault owner mis-config");
      expect(await pcsTwoSides.router()).to.be.eq(
        config.Exchanges.Pancakeswap.RouterV2,
        "pcs twosides router mis-config"
      );
      expect(await pcsTwoSides.vault()).to.be.eq(vault.address, "pcs twosides vault mis-config");
      expect(await waultTwoSides.router()).to.be.eq(
        config.Exchanges.Waultswap.WaultswapRouter,
        "wault twosides router mis-config"
      );
      expect(await waultTwoSides.vault()).to.be.eq(vault.address, "wault twosides vault mis-config");
      expect(await pcsSingleTwoSides.router()).to.be.eq(
        config.Exchanges.Pancakeswap.RouterV2,
        "pcs single asset twosides mis-config"
      );
      expect(await pcsSingleTwoSides.vault()).to.be.eq(vault.address, "pcs single asset twosides vault mis-config");
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
