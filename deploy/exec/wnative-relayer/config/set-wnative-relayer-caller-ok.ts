import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { WNativeRelayer__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";
import { getDeployer } from "../../../../utils/deployer-helper";

interface ISetCallerOk {
  TARGETS: Array<string>;
  OK: boolean;
}

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

  const inputParams: ISetCallerOk = {
    TARGETS: [
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
    OK: true,
  };

  const config = getConfig();
  const deployer = await getDeployer();

  console.log("> WNativeRelayer setCallerOk");

  const wNativeRelayer = WNativeRelayer__factory.connect(config.SharedConfig.WNativeRelayer, deployer);
  const tx = await wNativeRelayer.setCallerOk(inputParams.TARGETS, inputParams.OK);
  await tx.wait(3);

  console.log(`> Transaction hash: ${tx.hash}`);
  console.log("> ✅ Done");
};

export default func;
func.tags = ["WNativeRelayerSetCallerOk"];
