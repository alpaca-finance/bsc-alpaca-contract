import { NFTBoostedLeverageController } from "../../../../typechain/NFTBoostedLeverageController";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../../../../utils/deployer-helper";
import { UpgradeableContractDeployer } from "../../../deployer";
import { ConfigFileHelper } from "../../../helper";

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
  const cfh = new ConfigFileHelper();
  const config = cfh.getConfig();
  const NFTBoostedLeverageController = new UpgradeableContractDeployer<NFTBoostedLeverageController>(
    deployer,
    "NFTBoostedLeverageController"
  );

  if (!config.NFT?.NFTStaking)
    throw Error("[NFTBoostedLeverageController][deploy]: NFTStaking address not found in config");

  const { contract } = await NFTBoostedLeverageController.deploy([config.NFT.NFTStaking]);
  cfh.addOrSetNFTBoostedLeverageContoller(contract.address);
};

export default func;
func.tags = ["NFTBoostedLeverageController"];
