import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getConfig } from "../../../entities/config";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { DeltaNeutralVaultConfig03__factory } from "../../../../typechain";
import { Converter } from "../../../helper";

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

  const DELTA_VAULT_SYMBOL = ["n8x-BNBUSDT-PCS2"];

  const deployer = await getDeployer();
  const config = getConfig();
  const executors = config.AutomatedVaultExecutor!;

  // VALIDATING ALL DELTA_VAULT_SYMBOL
  const converter = new Converter();
  const configs = converter.convertDeltaSymbolToAddress(DELTA_VAULT_SYMBOL, "config");

  console.log(">> Set Executor to DeltaNeutralVaultConfig03 contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };
  for (const config of configs) {
    console.log(`>> Set Deposit Executor : ${executors.deposit} for config : ${config}`);
    console.log(`>> Set Withdraw Executor : ${executors.withdraw} for config : ${config}`);
    console.log(`>> Set Rebalance Executor : ${executors.rebalance} for config : ${config}`);
    console.log(`>> Set Reinvest Executor : ${executors.reinvest} for config : ${config}`);
    const deltaVaultConfig = DeltaNeutralVaultConfig03__factory.connect(config, deployer);

    await deltaVaultConfig.setExecutor(
      executors.deposit,
      executors.withdraw,
      executors.rebalance,
      executors.reinvest,
      ops
    );
  }
  console.log("✅ Done");
};

export default func;
func.tags = ["DeltaNeutralVaultConfigSetExecutor"];
