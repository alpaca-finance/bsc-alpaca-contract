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

  const swapFee = 25;
  const swapFeeDenom = 10000;
  const DELTA_VAULT_SYMBOL = ["bull6x-BUSDBTCB-PCS1"];

  const deployer = await getDeployer();

  // VALIDATING ALL DELTA_VAULT_SYMBOL
  const converter = new Converter();
  const configs = converter.convertDeltaSymbolToAddress(DELTA_VAULT_SYMBOL, "config");

  console.log(">> Set SwapFee to DeltaNeutralVaultConfig03 contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { gasLimit: 2000000 } : {};
  for (const config of configs) {
    console.log(`>> Set SwapFee to ${swapFee} SwapFeeDenom to ${swapFeeDenom} for config: ${config}`);
    const deltaVaultConfig = DeltaNeutralVaultConfig02__factory.connect(config, deployer);

    await deltaVaultConfig.setSwapConfig(swapFee, swapFeeDenom, { ...ops, nonce: nonce++ });
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVaultConfigSetSwapFee"];
