import { DeltaNeutralVault04__factory } from "./../../../../typechain/factories/DeltaNeutralVault04__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { BigNumber } from "ethers";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { Converter } from "../../../helper";
import { getConfig } from "../../../entities/config";
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
  const TARGETED_VAULTS = [
    "n3x-BNBUSDT-PCS1",
    "n8x-BNBUSDT-PCS1",
    "n8x-BNBUSDT-PCS2",
    "n3x-BNBBUSD-PCS1",
    "n3x-BNBUSDT-PCS2",
    "n3x-BNBBUSD-PCS2",
    "n3x-BNBUSDT-PCS3",
    "n3x-ETHUSDT-BSW1",
    "L3x-USDTETH-BSW1",
    "L3x-BUSDBTCB-PCS1",
    "L3x-BUSDBTCB-PCS2",
    "L3x-BUSDBNB-PCS1",
    "n8x-BNBUSDT-BSW1",
    "n8x-BNBUSDT-PCS3",
    "L8x-BUSDBTCB-PCS1",
    "L8x-USDTBNB-PCS1",
  ];
  const converter = new Converter();
  const deployer = await getDeployer();

  const vaults = converter.convertDeltaSymboltoObj(TARGETED_VAULTS);
  let nonce = await deployer.getTransactionCount();

  const config = getConfig();
  if (!config.DeltaNeutralVaultHealthChecker) {
    throw new Error(`Invalid address DeltaNeutralVaultHealthChecker`);
  }

  for (const vault of vaults) {
    console.log("------------------");
    console.log(`> Setting Config ${vault.symbol} setDeltaNeutralVaultHealthChecker`);
    const deltaNeutralVault04 = DeltaNeutralVault04__factory.connect(vault.address, deployer);
    const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };
    await deltaNeutralVault04.setDeltaNeutralVaultHealthChecker(config.DeltaNeutralVaultHealthChecker, ops);
    const checker = await deltaNeutralVault04.checker();
    if (compare(checker, config.DeltaNeutralVaultHealthChecker)) {
      console.log(`✅ Checking Done  ${vault.symbol}`);
    } else {
      console.log(`Checking FAILED ${vault.symbol}`);
    }
  }
  console.log("✅ Done");
};

export default func;
func.tags = ["DeltaNeutralVaultSetHealthChecker"];
