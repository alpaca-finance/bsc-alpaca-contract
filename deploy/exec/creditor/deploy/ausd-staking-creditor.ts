import { AUSDStakingCreditor } from "../../../../typechain/AUSDStakingCreditor";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
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

  const VALUE_PER_AUSD_STAKING = ethers.utils.parseEther("1");

  //AUSDStaking bsc 0x
  //AUSDStaking ftm 0x
  const AUSD_STAKING_ADDRESS = "0x201994a052781A133b425E4EB5655541A4DEE081";

  const deployer = await getDeployer();

  console.log(">> Deploying an upgradable AUSDStakingCreditor contract");

  const ausdStakingCreditorDeployer = new UpgradeableContractDeployer<AUSDStakingCreditor>(
    deployer,
    "AUSDStakingCreditor"
  );

  const { contract: ausdStakingCreditor } = await ausdStakingCreditorDeployer.deploy([
    AUSD_STAKING_ADDRESS,
    VALUE_PER_AUSD_STAKING,
  ]);

  const configFile = new ConfigFileHelper();

  configFile.addOrSetCreditors({
    name: "AUSDStakingCreditor",
    address: ausdStakingCreditor.address,
  });
};

export default func;
func.tags = ["AUSDStakingCreditor"];
