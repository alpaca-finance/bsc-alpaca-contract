import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";

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
  const STAKING_TOKEN = "";
  const ALLOC_POINT = 0;
  const EXACT_ETA = "";

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);
  console.log(">> Queue Transaction to add pool through Timelock");
  await timelock.queueTransaction(
    config.FairLaunch.address,
    "0",
    "addPool(uint256,address,bool)",
    ethers.utils.defaultAbiCoder.encode(["uint256", "address", "bool"], [ALLOC_POINT, STAKING_TOKEN, true]),
    EXACT_ETA
  );
  console.log("✅ Done");

  console.log(">> Generate timelock executeTransaction");
  console.log(
    `await timelock.executeTransaction('${config.FairLaunch.address}', '0', 'addPool(uint256,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','bool'], [${ALLOC_POINT}, '${STAKING_TOKEN}', true]), ${EXACT_ETA})`
  );
  console.log("✅ Done");
};

export default func;
func.tags = ["TimelockAddPool"];
