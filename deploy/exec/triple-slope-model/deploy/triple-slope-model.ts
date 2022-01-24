import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying TripleSlopeModel");
  const TripleSlopeModel = await ethers.getContractFactory("TripleSlopeModel", deployer);
  const tripleSlopeModel = await TripleSlopeModel.deploy();
  console.log("> TripleSlopeModel deployed at", tripleSlopeModel.address);
};

export default func;
func.tags = ["TripleSlopeModel"];
