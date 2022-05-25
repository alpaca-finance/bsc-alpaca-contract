import { Creditor } from "./../../../interfaces/config";
import { XALPACACreditor } from "./../../../../typechain/XALPACACreditor";
import { XALPACACreditor__factory } from "./../../../../typechain/factories/XALPACACreditor__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { UpgradeableContractDeployer } from "../../../deployer";

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

  const VALUE_PER_XALPACA = ethers.utils.parseEther("2");

  //XALPACA bsc 0xB7d85Ab25b9D478961face285fa3D8AAecAd24a9
  //XALPACA ftm 0x9e698f779Cec7F42663B051Ff8176A55FCb8d471
  const XALPACA_ADDRESS = "0xB7d85Ab25b9D478961face285fa3D8AAecAd24a9";

  const deployer = await getDeployer();

  console.log(">> Deploying an upgradable XALPACACreditor contract");

  const xalpacaCreditorDeployer = new UpgradeableContractDeployer<XALPACACreditor>(deployer, "xALPACACreditor");

  const { contract: xalpacaCreditor } = await xalpacaCreditorDeployer.deploy([XALPACA_ADDRESS, VALUE_PER_XALPACA]);

  const configFile = new ConfigFileHelper();

  configFile.addOrSetCreditors({
    name: "xAlpacaCreditor",
    address: xalpacaCreditor.address,
  });
};

export default func;
func.tags = ["XAlpacaCreditor"];
