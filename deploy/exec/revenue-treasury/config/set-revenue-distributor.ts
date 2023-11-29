import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { RevenueTreasury__factory } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";

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

  const REVENUE_DISTRIBUTOR = "0xabbee41c790556b1c1994abbcee898933dd8c609";

  const config = getConfig();
  const deployer = await getDeployer();
  const revenueTreasury = RevenueTreasury__factory.connect(config.RevenueTreasury!, deployer);

  const setRevenueDistributorTx = await revenueTreasury.setRevenueDistributor(REVENUE_DISTRIBUTOR);

  console.log(`> ✅ Done setRevenueDistributor tx: ${setRevenueDistributorTx.hash}`);
};

export default func;
func.tags = ["RevenueTreasurySetRevenueDistributor"];
