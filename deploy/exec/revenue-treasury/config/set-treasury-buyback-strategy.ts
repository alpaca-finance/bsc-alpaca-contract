import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { RevenueTreasury02__factory } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = getConfig();
  /*
  ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
  ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
  ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
  ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
  ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
  ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
  Check all variables below before execute the deployment script
  */

  const NEW_TREASURY_BUYBACK_STRAT = "0xB12d1E49813e28B89E5C30A46942bCE068d1Ee75";

  const deployer = await getDeployer();
  const revenueTreasury = RevenueTreasury02__factory.connect(config.RevenueTreasury!, deployer);

  const setNewTreasuryBuybackStratTx = await revenueTreasury.setTreasuryBuyBackStrategy(NEW_TREASURY_BUYBACK_STRAT);

  console.log(`> ✅ Done setToken at tx: ${setNewTreasuryBuybackStratTx.hash}`);
};

export default func;
func.tags = ["RevenueTreasury02SetTreasuryBuybackStrategy"];
