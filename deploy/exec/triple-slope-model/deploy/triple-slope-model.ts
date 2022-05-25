import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const SLOPE_VERSION = "TripleSlopeModel7";

  const [deployer] = await ethers.getSigners();

  console.log(`> Deploying ${SLOPE_VERSION}...`);
  const TripleSlopeModel = await ethers.getContractFactory(SLOPE_VERSION, deployer);
  const tripleSlopeModel = await TripleSlopeModel.deploy();
  console.log(`> ${SLOPE_VERSION} deployed at ${tripleSlopeModel.address}`);
};

export default func;
func.tags = ["TripleSlopeModel"];
