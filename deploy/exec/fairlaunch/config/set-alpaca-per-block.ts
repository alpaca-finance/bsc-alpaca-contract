import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";

interface IAddPool {
  STAKING_TOKEN_ADDRESS: string;
  ALLOC_POINT: number;
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
  const ALPACA_PER_BLOCK = ethers.utils.parseEther("1.5");
  const EXACT_ETA = "1648771200";

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  console.log(`>> Timelock: Set ALPACA per block to ${ethers.utils.formatEther(ALPACA_PER_BLOCK)} via Timelock`);
  await timelock.queueTransaction(
    config.Shield,
    "0",
    "setAlpacaPerBlock(uint256)",
    ethers.utils.defaultAbiCoder.encode(["uint256"], [ALPACA_PER_BLOCK]),
    EXACT_ETA
  );
  console.log("generate timelock.executeTransaction:");
  console.log(
    `await timelock.executeTransaction('${config.Shield}', '0', 'setAlpacaPerBlock(uint256)', ethers.utils.defaultAbiCoder.encode(['uint256'],['${ALPACA_PER_BLOCK}']), ${EXACT_ETA})`
  );
  console.log("✅ Done");
};

export default func;
func.tags = ["TimelockSetAlpacaPerBlock"];
