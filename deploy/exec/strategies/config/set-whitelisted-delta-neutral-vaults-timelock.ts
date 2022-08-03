import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
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
  const WHITELISTED_STRATS_DELTA_NEUTRAL_VAULTS: ISetWhitelistedStratsDeltaNeutralVaults = [];

  const TIMELOCK = "0x2D5408f2287BF9F9B05404794459a846651D0a59";
  const EXACT_ETA = "1619676000";
  const deployer = await getDeployer();
  const timelock = Timelock__factory.connect(TIMELOCK, deployer);

  for (let i = 0; i < WHITELISTED_STRATS_DELTA_NEUTRAL_VAULTS.length; i++) {
    const params = WHITELISTED_STRATS_DELTA_NEUTRAL_VAULTS[i];
    console.log(
      `>> Timelock: adding ${JSON.stringify(params.DELTA_NEUTRAL_VAULTS)} as a whitelisted workers of: "${
        params.STRAT_NAME
      }" via Timelock`
    );
    await timelock.queueTransaction(
      params.STRAT_ADDR,
      "0",
      "setDeltaNeutralVaultsOk(address[],bool)",
      ethers.utils.defaultAbiCoder.encode(["address[]", "bool"], [params.DELTA_NEUTRAL_VAULTS, true]),
      EXACT_ETA
    );
    const worker_addresses = params.DELTA_NEUTRAL_VAULTS.map((worker) => `'${worker}'`);
    console.log("generate timelock.executeTransaction:");
    console.log(
      `await timelock.executeTransaction('${params.STRAT_ADDR}', '0', 'setDeltaNeutralVaultsOk(address[],bool)', ethers.utils.defaultAbiCoder.encode(['address[]','bool'],[[${worker_addresses}], true]), ${EXACT_ETA})`
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["TimelockSetSharedStratsWhitelistedDeltaNeutralVaults"];
