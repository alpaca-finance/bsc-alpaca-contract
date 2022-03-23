import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { TwoSlopeModel, TwoSlopeModel__factory } from "../../../../typechain";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying TwoSlopeModel");
  const TwoSlopeModel = (await ethers.getContractFactory("TwoSlopeModel", deployer)) as TwoSlopeModel__factory;
  const twoSlopeModel = (await TwoSlopeModel.deploy()) as TwoSlopeModel;
  await twoSlopeModel.deployTransaction.wait(3);
  console.log("> TwoSlopeModel deployed at", twoSlopeModel.address);
};

export default func;
func.tags = ["TwoSlopeModel"];
