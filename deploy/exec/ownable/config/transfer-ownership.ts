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
    "0xC8E32D88783d945D0e4b9e7a06E33A57c2893a3a",
    "0xb0091A608624922524BceE393b86E341859DA798",
    "0x6AD3272642EcaCd2900A187Ee2a60f7393ea9633",
    "0x9BE4D90308A97a0ADe57e156F376109928d11356",
    "0x9D7a176978fE9dd01ed915127ba322536c4Ce977",
    "0xa4423AFf7809A22DE0D11A959B94E9aA770983ca",
    "0x7B897063C6A5B8395650929fBf5335E905e3d849",
    "0xA8979539A2567f8E2Ea0427945e1af2D5a66F69A",
    "0xd7c4144482438157745f6Ec7eec18479cc519941",
    "0xbB7754E19c683f09Ec7a2026A9b78eb724068813",
    "0x650F3883697dcdAa244A98B01c72e2261dbcdC4A",
    "0xa3fe176fF3930969e53ad8a89e61C549Fd7a1f29",
    "0x048e3E408E7661e81E7bc70b0DC08fA138e807EE",
    "0x0D0a50fC296f9CaDf82927255E7fFd1E30aA2B84",
    "0x8730CEeff138078a87DaFD639a07c17a62163ffC",
    "0x748d0378d10e0C7fdA66200408715d2a4529C60B",
    "0xbeA76403dd34254eB64bB6d952E76db4080B6b96",
    "0xB297ac2Ea53afCbC0dA52A30a117A9D36f843b06",
    "0xaD69bE6a07Bf041D96F496543214Bc9e4861b467",
    "0x222e16e80dc7d1C9B5BdE5316f3Aa839a469cbef",
    "0xa08D6B67D0d1121caA445369D276Ce5b7c092Ea6",
    "0x7e8a5817D53C079584abfaEEfAbD07454b7157ab",
    "0xF404b0689aC12952143F94097d65C84BbCf482aE",
    "0xB407B2611B6d3807b745C7fD6D523784AdaE037f",
    "0xa600af4fDc98EDB58e434496DCdB4820E056Ab3E",
    "0xb18Fc7E72daebCAd8411dE73748FD0B2b78fa904",
    "0x4c5D9d5980693557787A45046E434ad8325ae56b",
    "0xE7Dc3EDE042284FA0dAC40Ef6323A46CaD0Ce80e",
    "0x1EE0fD6EdD60A8148af53a0041146991E01ec311",
    "0x73a043773fe08429eC4190e3110C12B90ABD8583",
    "0xA5B6C6F69afd40eFaE7d82Ecc2688d03ba37B938",
    "0xc77Fac3973b8a8093AF22F1fed6caE7144B4450A",
    "0xF2D7642AEd6c1acC285A67497A83999A9E18EcE0",
    "0x3E40fd95B1Df78dBD44E5dd781bd3aEAB086A8c1",
  ];

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
