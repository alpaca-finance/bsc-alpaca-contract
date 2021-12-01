import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Ownable__factory } from "../../../../typechain";
import { ethers } from "hardhat";
import { ConfigEntity } from "../../../entities";

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

  const TO_BE_LOCKED = ["0x8a426aABF42AaE9E0f483cBe3C0DCc00b7659AEC", "0x68f131fe93cFc18A6B3eC6312e18c089221a5C34"];

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
  let nonce = await deployer.getTransactionCount();

  for (let i = 0; i < TO_BE_LOCKED.length; i++) {
    console.log(`>> Transferring ownership of ${TO_BE_LOCKED[i]} to TIMELOCK`);
    const ownable = Ownable__factory.connect(TO_BE_LOCKED[i], deployer);
    await ownable.transferOwnership(config.Timelock, { gasPrice: ethers.utils.parseUnits("20", "gwei"), nonce });
    nonce++;
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["TransferOwnershipToTimeLock"];
