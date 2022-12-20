import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { ethers, upgrades } from "hardhat";
import { getConfig } from "../../../entities/config";
import { ProxyAdmin__factory } from "../../../../typechain";

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
  console.log(">> Upgrading AutomatedVaultController contract");

  const config = getConfig();
  const newAutomatedVaultController = await ethers.getContractFactory("AutomatedVaultController");
  const preparedNewVault = await upgrades.prepareUpgrade(
    config.AutomatedVaultController?.address!,
    newAutomatedVaultController
  );
  console.log(`> Implementation address: ${preparedNewVault}`);
  console.log("✅ Done");

  const ops = isFork() ? { gasLimit: 2000000 } : {};
  const proxyAdmin = ProxyAdmin__factory.connect(config.ProxyAdmin, deployer);
  const upgradeTx = await proxyAdmin.upgrade(config.AutomatedVaultController?.address!, preparedNewVault, ops);
  upgradeTx.wait(3);
  console.log("Upgrade done at: ", upgradeTx.hash);
};

export default func;
func.tags = ["UpgradeAVController"];
