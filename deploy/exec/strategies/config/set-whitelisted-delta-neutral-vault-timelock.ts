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
    {
      STRAT_NAME: "StrategyRepurchaseBorrow",
      STRAT_ADDR: config.SharedStrategies.All?.StrategyRepurchaseBorrow!,
      DELTA_NEUTRAL_VAULTS: [
        "0xe9Bd0B7333596d0a87DED9EE1a782AA052B711AB",
        "0x8e5CfA7C06F187B56537f7F0CaBfb55611Af6F16",
        "0xC57876a95A4f31a0A4FDB0329Fc78e00B092cC94",
        "0x9fE96180AB2ADfaEBc735336f9213F26Bca99aa1",
        "0x96C607E34008630dC8132F517A33Be2772835f9c",
        "0xD14ED91dcD2E06ED72F536008cCd581DA73adDB5",
        "0xd1464C0D4424a353C4F243A11C806BdCbd783092",
        "0xf8130b2B4717ABB7F23A0433E634AAc1BB6aBE22",
        "0xB8d7B5A245f0080814f19dFE58037072315B7d19",
        "0x4eE770919aB741cC84bBE8cD83C21d79785f37E9",
        "0xA1679223b7585725aFb425a6F59737a05e085C40",
        "0xcC125BBaFF77De472f236255DE6be0a3B4323064",
        "0x6407bB0B0de04539Cd7bac7cd11f57303e625678",
        "0x3756b184d647EC3690Ce47ec3C182Db046ef8B2e",
        "0x98a7D8C26D5925d69F6D685E7b723F81325Fa035",
        "0xB7da7edcb1C0fE56E0124fCc22b26dB0111135a9",
      ],
    },
    // PANCAKESWAP
    {
      STRAT_NAME: "StrategyPartialCloseNoTrade",
      STRAT_ADDR: config.SharedStrategies.Pancakeswap?.StrategyPartialCloseNoTrade!,
      DELTA_NEUTRAL_VAULTS: [
        "0xe9Bd0B7333596d0a87DED9EE1a782AA052B711AB",
        "0x8e5CfA7C06F187B56537f7F0CaBfb55611Af6F16",
        "0xC57876a95A4f31a0A4FDB0329Fc78e00B092cC94",
        "0x9fE96180AB2ADfaEBc735336f9213F26Bca99aa1",
        "0x96C607E34008630dC8132F517A33Be2772835f9c",
        "0xD14ED91dcD2E06ED72F536008cCd581DA73adDB5",
        "0xd1464C0D4424a353C4F243A11C806BdCbd783092",
        "0x4eE770919aB741cC84bBE8cD83C21d79785f37E9",
        "0xA1679223b7585725aFb425a6F59737a05e085C40",
        "0xcC125BBaFF77De472f236255DE6be0a3B4323064",
        "0x3756b184d647EC3690Ce47ec3C182Db046ef8B2e",
        "0x98a7D8C26D5925d69F6D685E7b723F81325Fa035",
        "0xB7da7edcb1C0fE56E0124fCc22b26dB0111135a9",
      ],
    },
    // BISWAP
    {
      STRAT_NAME: "StrategyPartialCloseNoTrade",
      STRAT_ADDR: config.SharedStrategies.Biswap?.StrategyPartialCloseNoTrade!,
      DELTA_NEUTRAL_VAULTS: [
        "0xf8130b2B4717ABB7F23A0433E634AAc1BB6aBE22",
        "0xB8d7B5A245f0080814f19dFE58037072315B7d19",
        "0x6407bB0B0de04539Cd7bac7cd11f57303e625678",
      ],
    },
  ];

  const EXACT_ETA = "1663218000";
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
