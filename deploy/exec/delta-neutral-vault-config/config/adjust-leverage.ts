import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeltaNeutralVault04__factory, DeltaNeutralVaultConfig02__factory } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
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

  const TARGET_VAULT_SYMBOL: string = "n8x-BNBUSDT-PCS2";
  const TARGET_LEVERAGE: number = 8;

  // to be safe
  if (TARGET_LEVERAGE < 3 || TARGET_LEVERAGE > 8) {
    throw new Error("LEVERAGE Not Allow!!!!");
  }

  const deployer = await getDeployer();
  const converter = new Converter();

  const vault = converter.convertDeltaSymboltoObj([TARGET_VAULT_SYMBOL])[0]!;

  const deltaVaultConfig = DeltaNeutralVaultConfig02__factory.connect(vault.config, deployer);
  const deltaVault = DeltaNeutralVault04__factory.connect(vault.address, deployer);
  const isRetargetor = await deltaVaultConfig.whitelistedRebalancers(deployer.address);

  if (!isRetargetor) {
    console.log(`> Whitelist deployer to be retargetor on ${vault.symbol}`);
    await deltaVaultConfig.setWhitelistedRebalancer([deployer.address], true);
    console.log("> Done Whitelist deployer");
  }

  console.log(`> Setting new leverage level at: ${TARGET_LEVERAGE} for vault: ${vault.symbol}`);
  const setLeverageTx = await deltaVaultConfig.setLeverageLevel(TARGET_LEVERAGE);
  console.log(`> ⛓ Tx is submitted: ${setLeverageTx.hash}`);
  console.log(`> Waiting for tx to be mined...`);
  const setLeverageReceipt = await setLeverageTx.wait(3);
  console.log(`> 🟢 Done Setting new leverage level`);

  if (setLeverageReceipt.status === 1) {
    console.log(`> Executing retarget for vault: ${vault.symbol}`);
    const tx = await deltaVault.retarget("0x00", { gasLimit: 7000000 });
    console.log(`> ⛓ Tx is submitted: ${tx.hash}`);
    console.log(`> Waiting for tx to be mined...`);
    await tx.wait(3);
    console.log(`> 🟢 Done executing retarget `);
  }
};

export default func;
func.tags = ["DeltaNeutralVaultConfigAdjustLeverage"];
