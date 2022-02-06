import { ethers, network } from "hardhat";
import { expect } from "chai";
import "@openzeppelin/test-helpers";
import {
  CakeMaxiWorker__factory,
  ConfigurableInterestVaultConfig,
  ConfigurableInterestVaultConfig__factory,
  MdexWorker02__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
  PancakeswapV2Worker__factory,
  SpookyWorker03__factory,
  Vault,
  Vault__factory,
  WaultSwapWorker__factory,
} from "../typechain";
import { WorkersEntity } from "../deploy/interfaces/config";
import { getConfig } from "../deploy/entities/config";

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
  } else if (workerInfo.name.includes("MdexWorker")) {
    const worker = MdexWorker02__factory.connect(workerInfo.address, ethers.provider);
    try {
      expect(await worker.operator()).to.be.eq(vault.address, "operator mis-config");
      expect(workerInfo.stakingToken).to.be.eq(await worker.lpToken(), "lpToken mis-config");
      expect(workerInfo.pId).to.be.eq(await worker.pid(), "pool id mis-config");
      expect(workerInfo.stakingTokenAt).to.be.eq(await worker.bscPool(), "bscPool mis-config");
      expect(await worker.router()).to.be.eq(routers.mdex, "router mis-config");
      expect(await worker.baseToken()).to.be.eq(await vault.token(), "baseToken mis-config");
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
  } else if (workerInfo.name.includes("SpookyWorker")) {
    const worker = SpookyWorker03__factory.connect(workerInfo.address, ethers.provider);
    try {
      expect(await worker.operator()).to.be.eq(vault.address, "operator mis-config");
      expect(workerInfo.stakingToken).to.be.eq(await worker.lpToken(), "lpToken mis-config");
      expect(workerInfo.pId).to.be.eq(await worker.pid(), "pool id mis-config");
      expect(workerInfo.stakingTokenAt).to.be.eq(await worker.spookyMasterChef(), "spookyMasterChef mis-config");
      expect(await worker.router()).to.be.eq(routers.spooky, "router mis-config");
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
          config.Exchanges.Pancakeswap!.RouterV2
        ),
        validateStrategy(
          config.SharedStrategies.Pancakeswap!.StrategyLiquidate,
          config.Exchanges.Pancakeswap!.RouterV2
        ),
        validateStrategy(
          config.SharedStrategies.Pancakeswap!.StrategyWithdrawMinimizeTrading,
          config.Exchanges.Pancakeswap!.RouterV2
        ),
        validateStrategy(
          config.SharedStrategies.Pancakeswap!.StrategyPartialCloseLiquidate,
          config.Exchanges.Pancakeswap!.RouterV2
        ),
        validateStrategy(
          config.SharedStrategies.Pancakeswap!.StrategyPartialCloseMinimizeTrading,
          config.Exchanges.Pancakeswap!.RouterV2
        ),
        validateStrategy(
          config.SharedStrategies.Waultswap!.StrategyAddBaseTokenOnly,
          config.Exchanges.Waultswap!.WaultswapRouter
        ),
        validateStrategy(
          config.SharedStrategies.Waultswap!.StrategyLiquidate,
          config.Exchanges.Waultswap!.WaultswapRouter
        ),
        validateStrategy(
          config.SharedStrategies.Waultswap!.StrategyWithdrawMinimizeTrading,
          config.Exchanges.Waultswap!.WaultswapRouter
        ),
        validateStrategy(
          config.SharedStrategies.Waultswap!.StrategyPartialCloseLiquidate,
          config.Exchanges.Waultswap!.WaultswapRouter
        ),
        validateStrategy(
          config.SharedStrategies.Waultswap!.StrategyPartialCloseMinimizeTrading,
          config.Exchanges.Waultswap!.WaultswapRouter
        ),
        validateStrategy(config.SharedStrategies.Mdex!.StrategyAddBaseTokenOnly, config.Exchanges.Mdex!.MdexRouter),
        validateStrategy(config.SharedStrategies.Mdex!.StrategyLiquidate, config.Exchanges.Mdex!.MdexRouter),
        validateStrategy(
          config.SharedStrategies.Mdex!.StrategyPartialCloseLiquidate,
          config.Exchanges.Mdex!.MdexRouter
        ),
        validateStrategy(
          config.SharedStrategies.Mdex!.StrategyPartialCloseMinimizeTrading,
          config.Exchanges.Mdex!.MdexRouter
        ),
        validateStrategy(
          config.SharedStrategies.Mdex!.StrategyWithdrawMinimizeTrading,
          config.Exchanges.Mdex!.MdexRouter
        ),
      ]);
      console.log("> ✅ done");
    } catch (e) {
      console.log(e);
    }
  }
  if (chainId === 4002) {
    console.log(">> Validate in Fantom context");
    try {
      await Promise.all([
        validateStrategy(
          config.SharedStrategies.SpookySwap!.StrategyAddBaseTokenOnly,
          config.Exchanges.SpookySwap!.SpookyRouter
        ),
        validateStrategy(
          config.SharedStrategies.SpookySwap!.StrategyLiquidate,
          config.Exchanges.SpookySwap!.SpookyRouter
        ),
        validateStrategy(
          config.SharedStrategies.SpookySwap!.StrategyWithdrawMinimizeTrading,
          config.Exchanges.SpookySwap!.SpookyRouter
        ),
        validateStrategy(
          config.SharedStrategies.SpookySwap!.StrategyPartialCloseLiquidate,
          config.Exchanges.SpookySwap!.SpookyRouter
        ),
        validateStrategy(
          config.SharedStrategies.SpookySwap!.StrategyPartialCloseMinimizeTrading,
          config.Exchanges.SpookySwap!.SpookyRouter
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
            config.Exchanges.Pancakeswap!.RouterV2
          ),
          validateTwoSidesStrategy(
            config.Vaults[i].StrategyAddTwoSidesOptimal.Waultswap!,
            vault.address,
            config.Exchanges.Waultswap!.WaultswapRouter
          ),
          validateTwoSidesStrategy(
            config.Vaults[i].StrategyAddTwoSidesOptimal.PancakeswapSingleAsset!,
            vault.address,
            config.Exchanges.Pancakeswap!.RouterV2
          ),
          validateTwoSidesStrategy(
            config.Vaults[i].StrategyAddTwoSidesOptimal.Mdex!,
            vault.address,
            config.Exchanges.Mdex!.MdexRouter
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
    if (chainId === 4002) {
      try {
        await Promise.all([
          validateTwoSidesStrategy(
            config.Vaults[i].StrategyAddTwoSidesOptimal.SpookySwap!,
            vault.address,
            config.Exchanges.SpookySwap!.SpookyRouter
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
      dexRouters.pancakeswap = config.Exchanges.Pancakeswap!.RouterV2;
      dexRouters.waultswap = config.Exchanges.Waultswap!.WaultswapRouter;
      dexRouters.mdex = config.Exchanges.Mdex!.MdexRouter;
    }
    if (chainId === 4002 || chainId == 250) {
      dexRouters.spooky = config.Exchanges.SpookySwap!.SpookyRouter;
    }
    for (const worker of config.Vaults[i].workers) {
      validateWorkers.push(validateWorker(vault, worker, dexRouters));
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
