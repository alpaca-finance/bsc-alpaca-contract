import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { RepurchaseBorrowStrategy__factory, Timelock__factory } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";
import { compare } from "../../../../utils/address";

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
  const config = getConfig();
  const WHITELISTED_STRATS_DELTA_NEUTRAL_VAULTS: ISetWhitelistedStratsDeltaNeutralVaults = [
    // SpookySwap
    {
      STRAT_NAME: "StrategyPartialCloseNoTrade",
      STRAT_ADDR: config.SharedStrategies.SpookySwap?.StrategyPartialCloseNoTrade!,
      DELTA_NEUTRAL_VAULTS: [
        "0x18a9853102b51Bb228E277BeE25625874f184398",
        "0xF052D626743Ad2F3b38A99DD9F3C946c2A12E843",
      ],
    },
  ];
  const EXACT_ETA = "1680865200";

  const deployer = await getDeployer();
  const timelock = Timelock__factory.connect(config.Timelock, deployer);

  for (let i = 0; i < WHITELISTED_STRATS_DELTA_NEUTRAL_VAULTS.length; i++) {
    const params = WHITELISTED_STRATS_DELTA_NEUTRAL_VAULTS[i];
    const strat = RepurchaseBorrowStrategy__factory.connect(params.STRAT_ADDR, deployer);
    const owner = await strat.owner();
    const worker_addresses = params.DELTA_NEUTRAL_VAULTS.map((worker) => `'${worker}'`);
    if (compare(owner, config.Timelock)) {
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
      console.log("generate timelock.executeTransaction:");
      console.log(
        `await timelock.executeTransaction('${params.STRAT_ADDR}', '0', 'setDeltaNeutralVaultsOk(address[],bool)', ethers.utils.defaultAbiCoder.encode(['address[]','bool'],[[${worker_addresses}], true]), ${EXACT_ETA})`
      );
    } else {
      await strat.setDeltaNeutralVaultsOk(params.DELTA_NEUTRAL_VAULTS, true);
      console.log("execute transaction:");
      console.log(`await '${strat.address}'.setDeltaNeutralVaultsOk(${worker_addresses}, true);`);
    }

    console.log("✅ Done");
  }
};

export default func;
func.tags = ["TimelockSetSharedStratsWhitelistedDeltaNeutralVaults"];
