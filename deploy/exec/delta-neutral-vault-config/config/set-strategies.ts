import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getConfig } from "../../../entities/config";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { DeltaNeutralVaultConfig03__factory } from "../../../../typechain";
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

  const DELTA_VAULT_SYMBOL = ["n8x-BNBUSDT-PCS2", "n8x-BNBUSDT-PCS1", "n3x-BNBBUSD-PCS1"];

  const deployer = await getDeployer();
  const config = getConfig();

  // VALIDATING ALL DELTA_VAULT_SYMBOL
  const converter = new Converter();
  const configs = converter.convertDeltaSymbolToAddress(DELTA_VAULT_SYMBOL, "config");
  const stableWorkers = converter.convertDeltaSymbolToAddress(DELTA_VAULT_SYMBOL, "stableDeltaWorker");
  const assetWorkers = converter.convertDeltaSymbolToAddress(DELTA_VAULT_SYMBOL, "assetDeltaWorker");
  const stableWorkersEntity = converter.convertAddressesToWorkers(stableWorkers);
  const assetWorkersEntity = converter.convertAddressesToWorkers(assetWorkers);

  console.log(">> Set Strategies to DeltaNeutralVaultConfig03 contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };
  for (let i: number = 0; i < configs.length; i++) {
    const stableWorker = stableWorkersEntity[i];
    const assetWorker = assetWorkersEntity[i];
    const deltaVaultConfig = DeltaNeutralVaultConfig03__factory.connect(configs[i], deployer);
    console.log(
      `>> Set StrategyPartialCloseMinimizeTrading: ${stableWorker.strategies.StrategyPartialCloseMinimizeTrading} for config: ${configs[i]}`
    );
    console.log(
      `>> Set StableStrategyAddTwoSidesOptimal: ${stableWorker.strategies.StrategyAddTwoSidesOptimal} for config: ${configs[i]}`
    );
    console.log(
      `>> Set AssetStrategyAddTwoSidesOptimal: ${assetWorker.strategies.StrategyAddTwoSidesOptimal} for config: ${configs[i]}`
    );
    await deltaVaultConfig.setStrategies(
      stableWorker.strategies.StrategyPartialCloseMinimizeTrading,
      stableWorker.strategies.StrategyAddTwoSidesOptimal,
      assetWorker.strategies.StrategyAddTwoSidesOptimal,
      ops
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVaultConfigSetStrategies"];
