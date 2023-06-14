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

  const TARGETED_VAULTS = [
    "n8x-BUSDUSDT-PCS1",
    "L3x-BUSDBNB-PCS1",
    "L8x-BUSDBNB-PCS1",
    "L8x-USDTBNB-BSW1",
    "L8x-USDTBNB-PCS1",
    "L3x-BUSDBTCB-PCS1",
    "n3x-BNBUSDT-PCS1",
    "n3x-BNBBUSD-PCS1",
    "n8x-BNBUSDT-PCS1",
    "n8x-BNBUSDT-PCS2",
  ];

  const terminator = config.AutomatedVaultExecutor?.terminator02!;

  const deployer = await getDeployer();

  const converter = new Converter();
  const toBeTerminatedVaults = converter.convertDeltaSymboltoObj(TARGETED_VAULTS);
  let nonce = await deployer.getTransactionCount();

  for (const vault of toBeTerminatedVaults) {
    const terminateVaultAsDeployer = TerminateAV__factory.connect(vault.address, deployer);
    const ops = isFork() ? { nonce: nonce++, gasLimit: 10000000 } : { nonce: nonce++ };

    console.log("Terminating:", vault.symbol);
    const terminateTx = await terminateVaultAsDeployer.terminate(terminator, ops);

    const terminateReceipt = await terminateTx.wait(3);
    console.log(">> terminateTx: ", terminateReceipt.transactionHash);
  }
  console.log("✅ Done");
};

export default func;
func.tags = ["ExecuteTerminateAV"];
