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

  const NEW_TREASURY_BUYBACK_STRAT = "0x6AC4334Ddd701Dd69169fE66D33c563e0F2C855e";

  const deployer = await getDeployer();
  const revenueTreasury = RevenueTreasury02__factory.connect(config.RevenueTreasury!, deployer);

  const setNewTreasuryBuybackStratTx = await revenueTreasury.setTreasuryBuyBackStrategy(NEW_TREASURY_BUYBACK_STRAT);

  console.log(`> ✅ Done setNewTreasuryBuybackStrat at tx: ${setNewTreasuryBuybackStratTx.hash}`);
};

export default func;
func.tags = ["RevenueTreasury02SetTreasuryBuybackStrategy"];
