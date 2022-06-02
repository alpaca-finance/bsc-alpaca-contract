import { Converter } from "./../../../helper/converter";
import { XALPACACreditor__factory } from "./../../../../typechain";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";

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

  const SETTER_ADDRESS = "0xe45216ac4816a5ec5378b1d13de8aa9f262ce9de";

  if (!SETTER_ADDRESS) {
    throw new Error("ERROR NO SETTER ADDRESS");
  }

  const CREDITOR_NAME: string = "xAlpacaCreditor";

  const deployer = await getDeployer();

  const converter = new Converter();
  const creditorAddr = converter.convertCreditorNameToAddress([CREDITOR_NAME])[0];

  console.log(`>> Set param xAlpacaCreditor contract address: ${creditorAddr}`);
  const xAlpacaCreditor = XALPACACreditor__factory.connect(creditorAddr, deployer);
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };
  await xAlpacaCreditor.setValueSetter(SETTER_ADDRESS, ops);
};

export default func;

func.tags = ["XAlpacaCreditorSetParam"];
