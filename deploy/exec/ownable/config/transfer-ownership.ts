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

  const TO_BE_LOCKED = [
    "0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F",
    "0x838B7F64Fa89d322C563A6f904851A13a164f84C",
    "0xc1018f4Bba361A1Cc60407835e156595e92EF7Ad",
    "0x831332f94C4A0092040b28ECe9377AfEfF34B25a",
    "0x2E7f32e38EA5a5fcb4494d9B626d2d393B176B1E",
    "0x60dDe8BBE160fe033fACB3446Cf7795cC575B171",
    "0x95bBd366FaA1D7F29484Cc33Cd5c89905fd29a12",
    "0xE986679b06E9D4c72C5B504c86Eb64d546710Aa6",
    "0x23ff13d43702cA95a6369736dBFf6Ea718b5F0b0",
    "0x83875cB3B520275183c5c383C8745199293Cd89C",
  ];

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
  let nonce = await deployer.getTransactionCount();

  for (let i = 0; i < TO_BE_LOCKED.length; i++) {
    console.log(`> Transferring ownership of ${TO_BE_LOCKED[i]} to Timelock`);
    const ownable = Ownable__factory.connect(TO_BE_LOCKED[i], deployer);
    await ownable.transferOwnership(config.Timelock, {
      nonce: nonce++,
    });
    console.log("> ✅ Done");
  }
};

export default func;
func.tags = ["TransferOwnershipToTimeLock"];
