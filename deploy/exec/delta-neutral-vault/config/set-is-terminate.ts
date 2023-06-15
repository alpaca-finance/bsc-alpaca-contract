import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { Converter } from "../../../helper";
import { TerminateAV02__factory } from "../../../../typechain";

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

  const IS_TERMINATE = true;
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

  const deployer = await getDeployer();

  const converter = new Converter();
  const toBeTerminatedVaults = converter.convertDeltaSymboltoObj(TARGETED_VAULTS);
  let nonce = await deployer.getTransactionCount();

  for (const vault of toBeTerminatedVaults) {
    const terminateVaultAsDeployer = TerminateAV02__factory.connect(vault.address, deployer);
    const ops = isFork() ? { nonce: nonce++, gasLimit: 10000000 } : { nonce: nonce++ };

    console.log("Set isTerminating:", vault.symbol);
    const isTerminateTx = await terminateVaultAsDeployer.setIsTerminated(IS_TERMINATE, ops);

    const setIsTerminateReceipt = await isTerminateTx.wait(0);
    console.log(">> isTerminatingTx: ", setIsTerminateReceipt.transactionHash);
  }
  console.log("✅ Done");
};

export default func;
func.tags = ["SetIsTerminateAV"];
