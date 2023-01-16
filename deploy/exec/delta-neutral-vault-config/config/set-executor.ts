import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getConfig } from "../../../entities/config";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { DeltaNeutralVaultConfig02__factory } from "../../../../typechain";
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

  const deployer = await getDeployer();
  const config = getConfig();

  // update
  const DELTA_VAULT_SYMBOL = [
    "n3x-BNBUSDT-PCS1",
    "n8x-BNBUSDT-PCS1",
    "n8x-BNBUSDT-PCS2",
    "n3x-BNBBUSD-PCS1",
    "L3x-BUSDBTCB-PCS1",
    "L3x-BUSDBNB-PCS1",
    "L8x-USDTBNB-PCS1",
  ];
  const executors = config.AutomatedVaultExecutor!;

  // VALIDATING ALL DELTA_VAULT_SYMBOL
  const converter = new Converter();
  const configs = converter.convertDeltaSymbolToAddress(DELTA_VAULT_SYMBOL, "config");

  console.log(">> Set Executor to DeltaNeutralVaultConfig02 contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { gasLimit: 2000000 } : {};
  for (const config of configs) {
    console.log(`>> Set Deposit Executor: ${executors.deposit} for config: ${config}`);
    console.log(`>> Set Withdraw Executor: ${executors.withdraw} for config: ${config}`);
    console.log(`>> Set Rebalance Executor: ${executors.rebalance} for config: ${config}`);
    console.log(`>> Set Reinvest Executor: ${executors.reinvest} for config: ${config}`);
    console.log(`>> Set Repurchase Executor: ${executors.repurchase} for config: ${config}`);
    console.log(`>> Set Retarget Executor: ${executors.retarget} for config: ${config}`);
    const deltaVaultConfig = DeltaNeutralVaultConfig02__factory.connect(config, deployer);

    await deltaVaultConfig.setExecutor(
      executors.deposit,
      executors.withdraw,
      executors.rebalance,
      executors.reinvest,
      executors.repurchase!,
      executors.retarget!,
      {
        ...ops,
        nonce: nonce++,
      }
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVaultConfigSetExecutor"];
