import { zeroAddress } from "ethereumjs-util";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getConfig } from "../../../entities/config";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { DeltaNeutralVaultConfig02__factory } from "../../../../typechain";
import { Converter } from "../../../helper";
import { compare } from "../../../../utils/address";

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

  const DELTA_VAULT_SYMBOL = ["L8x-USDTBNB-BSW1"];
  const IS_DELTA = true;

  const deployer = await getDeployer();
  const config = getConfig();

  // VALIDATING ALL DELTA_VAULT_SYMBOL
  const converter = new Converter();
  const configs = converter.convertDeltaSymbolToAddress(DELTA_VAULT_SYMBOL, "config");
  const stableWorkers = converter.convertDeltaSymbolToAddress(DELTA_VAULT_SYMBOL, "stableDeltaWorker");
  const stableWorkersEntity = converter.convertAddressesToWorkers(stableWorkers);
  const assetWorkers = IS_DELTA ? converter.convertDeltaSymbolToAddress(DELTA_VAULT_SYMBOL, "assetDeltaWorker") : [];
  const assetWorkersEntity = converter.convertAddressesToWorkers(assetWorkers);

  console.log(">> Set Strategies to DeltaNeutralVaultConfig02 contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : {};
  for (let i: number = 0; i < configs.length; i++) {
    const stableWorker = stableWorkersEntity[i];
    const assetStrategyAddTwoSidesOptimal = IS_DELTA
      ? assetWorkersEntity[i].strategies.StrategyAddTwoSidesOptimal
      : zeroAddress();

    const deltaVaultConfig = DeltaNeutralVaultConfig02__factory.connect(configs[i], deployer);
    console.log(
      `>> Set StrategyPartialCloseMinimizeTrading: ${stableWorker.strategies.StrategyPartialCloseMinimizeTrading} for config: ${configs[i]}`
    );
    console.log(
      `>> Set StableStrategyAddTwoSidesOptimal: ${stableWorker.strategies.StrategyAddTwoSidesOptimal} for config: ${configs[i]}`
    );
    console.log(`>> Set AssetStrategyAddTwoSidesOptimal: ${assetStrategyAddTwoSidesOptimal} for config: ${configs[i]}`);

    await deltaVaultConfig.setStrategies(
      stableWorker.strategies.StrategyPartialCloseMinimizeTrading,
      stableWorker.strategies.StrategyAddTwoSidesOptimal,
      assetStrategyAddTwoSidesOptimal,
      config.SharedStrategies.All!.StrategyRepurchaseBorrow!,
      config.SharedStrategies.All!.StrategyRepurchaseRepay!,
      stableWorker.strategies.StrategyPartialCloseNoTrade!,
      { ...ops, nonce: nonce++ }
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVaultConfigSetStrategies"];
