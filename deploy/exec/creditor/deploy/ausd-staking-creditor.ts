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

  const configFile = new ConfigFileHelper();
  const AUSD_STAKING_ADDRESS = configFile.getConfig().AUSDStaking;

  if (!AUSD_STAKING_ADDRESS) {
    throw new Error("ERROR NO AUSD STAKING ADDRESS");
  }

  const deployer = await getDeployer();

  const ausdStakingCreditorDeployer = new UpgradeableContractDeployer<AUSDStakingCreditor>(
    deployer,
    "AUSDStakingCreditor"
  );

  const { contract: ausdStakingCreditor } = await ausdStakingCreditorDeployer.deploy([
    AUSD_STAKING_ADDRESS,
    VALUE_PER_AUSD_STAKING,
  ]);

  configFile.addOrSetCreditors({
    name: "AUSDStakingCreditor",
    address: ausdStakingCreditor.address,
  });
};

export default func;
func.tags = ["AUSDStakingCreditor"];
