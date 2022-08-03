import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { RepurchaseBorrowStrategy__factory, Timelock__factory } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";

interface ISetWhitelistedStratDeltaNeutralVaults {
  STRAT_NAME: string;
  STRAT_ADDR: string;
  DELTA_NEUTRAL_VAULTS: Array<string>;
}

type ISetWhitelistedStratsDeltaNeutralVaults = Array<ISetWhitelistedStratDeltaNeutralVaults>;

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
  const WHITELISTED_STRATS_DELTA_NEUTRAL_VAULTS: ISetWhitelistedStratsDeltaNeutralVaults = [
    {
      STRAT_NAME: "RepurchaseBorrowStrategy",
      STRAT_ADDR: "0x4906401dF8Ed0AC71ACBdA4b9527c6940dfd8391",
      DELTA_NEUTRAL_VAULTS: ["0xe9Bd0B7333596d0a87DED9EE1a782AA052B711AB"],
    },
  ];

  const deployer = await getDeployer();
  for (let i = 0; i < WHITELISTED_STRATS_DELTA_NEUTRAL_VAULTS.length; i++) {
    const params = WHITELISTED_STRATS_DELTA_NEUTRAL_VAULTS[i];
    const strat = RepurchaseBorrowStrategy__factory.connect(params.STRAT_ADDR, deployer);
    await strat.setDeltaNeutralVaultsOk(params.DELTA_NEUTRAL_VAULTS, true);
    const worker_addresses = params.DELTA_NEUTRAL_VAULTS.map((worker) => `'${worker}'`);
    console.log("execute transaction:");
    console.log(`await '${strat.address}'.setDeltaNeutralVaultsOk(${worker_addresses}, true);`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["SetSharedStratsWhitelistedDeltaNeutralVaults"];
