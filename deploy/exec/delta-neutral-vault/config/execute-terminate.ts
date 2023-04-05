import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getConfig } from "../../../entities/config";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { Converter } from "../../../helper";
import { TerminateAV__factory } from "../../../../typechain/factories/TerminateAV__factory";

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

  const TARGETED_VAULTS = ["n3x-FTMUSDC-SPK1", "n3x-FTMUSDC-SPK2"];

  const config = getConfig();

  const deployer = await getDeployer();

  const converter = new Converter();
  const toBeTerminatedVaults = converter.convertDeltaSymboltoObj(TARGETED_VAULTS);
  let nonce = await deployer.getTransactionCount();

  for (const vault of toBeTerminatedVaults) {
    const terminateVaultAsDeployer = TerminateAV__factory.connect(vault.address, deployer);
    const ops = isFork() ? { nonce: nonce++, gasLimit: 10000000 } : { nonce: nonce++ };

    console.log("Terminating:", vault.symbol);
    const terminateTx = await terminateVaultAsDeployer.terminate(config.AutomatedVaultExecutor?.terminator!, ops);

    const terminateReceipt = await terminateTx.wait(3);
    console.log(">> terminateTx: ", terminateReceipt.transactionHash);
  }
  console.log("✅ Done");
};

export default func;
func.tags = ["ExecuteTerminateAV"];
