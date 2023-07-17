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
  const config = getConfig();

  const TARGETED_VAULTS = ["L8x-USDTBNB-PCS1"];

  const terminator = config.AutomatedVaultExecutor?.terminator02!;

  const deployer = await getDeployer();

  const converter = new Converter();
  const toBeTerminatedVaults = converter.convertDeltaSymboltoObj(TARGETED_VAULTS);
  let nonce = await deployer.getTransactionCount();

  for (const vault of toBeTerminatedVaults) {
    const terminateVaultAsDeployer = TerminateAV__factory.connect(vault.address, deployer);
    const ops = isFork() ? { nonce: nonce++, gasLimit: 10000000 } : { nonce: nonce++, gasLimit: 10_000_000 };

    console.log("Terminating:", vault.symbol);
    const terminateTx = await terminateVaultAsDeployer.terminate(terminator, ops);

    const terminateReceipt = await terminateTx.wait(3);
    console.log(">> terminateTx: ", terminateReceipt.transactionHash);
  }
  console.log("✅ Done");
};

export default func;
func.tags = ["ExecuteTerminateAV"];
