import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { Timelock, Timelock__factory } from "../../../../typechain";
import {
  getShareStratsProxy,
  getStratFactory,
  PANCAKESWAPv2_SINGLE_ASSET_STRAT_ID,
  PANCAKESWAPv2_STRAT_ID,
  Strats,
  WAULTSWAP_STRAT_ID,
} from "../../../entities/strats";
import { getConfig } from "../../../entities/config";

interface IInput {
  PANCAKESWAP?: Array<Strats>;
  PANCAKESWAP_SINGLE_ASSET?: Array<Strats>;
  WAULTSWAP?: Array<Strats>;
}

async function timelockUpgrade(
  timelock: Timelock,
  proxyAdminAddress: string,
  proxyAddress: string,
  newImpl: string,
  exactEta: string
) {
  console.log(`>> New implementation deployed at: ${newImpl}`);
  console.log("✅ Done");

  console.log(`>> Upgrading strat: ${proxyAddress} through Timelock + ProxyAdmin`);
  console.log(`>> Queue tx on Timelock to upgrade the implementation`);
  await timelock.queueTransaction(
    proxyAdminAddress,
    "0",
    "upgrade(address,address)",
    ethers.utils.defaultAbiCoder.encode(["address", "address"], [proxyAddress, newImpl]),
    exactEta,
    { gasPrice: 100000000000 }
  );
  console.log("✅ Done");

  console.log(`>> Generate executeTransaction:`);
  const executionTx = `await timelock.executeTransaction('${proxyAdminAddress}', '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], ['${proxyAddress}','${newImpl}']), ${exactEta})`;
  console.log(executionTx);
  console.log("✅ Done");
}

/**
 * @description Deployment script for upgrades workers to 02 version
 * @param  {HardhatRuntimeEnvironment} hre
 */
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
  const input: IInput = {
    PANCAKESWAP: [Strats.liquidateAll],
    PANCAKESWAP_SINGLE_ASSET: [Strats.liquidateAll],
    WAULTSWAP: [Strats.liquidateAll],
  };
  const EXACT_ETA = "1628146800";

  const config = getConfig();
  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  if (input.PANCAKESWAP !== undefined) {
    const shareStrats = getShareStratsProxy(PANCAKESWAPv2_STRAT_ID);
    for (const strat of input.PANCAKESWAP) {
      const proxyAddress = shareStrats.find((s) => s.strat === strat);
      if (proxyAddress === undefined) throw new Error("not found proxy address");

      console.log(`=== Upgrade ${PANCAKESWAPv2_STRAT_ID} ${strat}`);
      const NewStrat = await getStratFactory(PANCAKESWAPv2_STRAT_ID, strat);
      const preparedNewStrat: string = await upgrades.prepareUpgrade(proxyAddress.proxy, NewStrat);
      await timelockUpgrade(timelock, config.ProxyAdmin, proxyAddress.proxy, preparedNewStrat, EXACT_ETA);
    }
  }

  if (input.PANCAKESWAP_SINGLE_ASSET !== undefined) {
    const shareStrats = getShareStratsProxy(PANCAKESWAPv2_SINGLE_ASSET_STRAT_ID);
    for (const strat of input.PANCAKESWAP_SINGLE_ASSET) {
      const proxyAddress = shareStrats.find((s) => s.strat === strat);
      if (proxyAddress === undefined) throw new Error("not found proxy address");

      console.log(`=== Upgrade ${PANCAKESWAPv2_SINGLE_ASSET_STRAT_ID} ${strat}`);
      const NewStrat = await getStratFactory(PANCAKESWAPv2_SINGLE_ASSET_STRAT_ID, strat);
      const preparedNewStrat: string = await upgrades.prepareUpgrade(proxyAddress.proxy, NewStrat);
      await timelockUpgrade(timelock, config.ProxyAdmin, proxyAddress.proxy, preparedNewStrat, EXACT_ETA);
    }
  }

  if (input.WAULTSWAP !== undefined) {
    const shareStrats = getShareStratsProxy(WAULTSWAP_STRAT_ID);
    for (const strat of input.WAULTSWAP) {
      const proxyAddress = shareStrats.find((s) => s.strat === strat);
      if (proxyAddress === undefined) throw new Error("not found proxy address");

      console.log(`=== Upgrade ${WAULTSWAP_STRAT_ID} ${strat}`);
      const NewStrat = await getStratFactory(WAULTSWAP_STRAT_ID, strat);
      const preparedNewStrat: string = await upgrades.prepareUpgrade(proxyAddress.proxy, NewStrat);
      await timelockUpgrade(timelock, config.ProxyAdmin, proxyAddress.proxy, preparedNewStrat, EXACT_ETA);
    }
  }
};

export default func;
func.tags = ["UpgradeShareStrategies"];
