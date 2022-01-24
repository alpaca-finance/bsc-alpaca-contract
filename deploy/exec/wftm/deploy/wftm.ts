import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { WrappedFtm__factory } from "../../../../typechain";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying WFTM");
  const WrappedFtm = (await ethers.getContractFactory("WrappedFtm", deployer)) as WrappedFtm__factory;
  const wrappedFtm = await WrappedFtm.deploy();
  await wrappedFtm.deployTransaction.wait(3);
  console.log("✅ Done");
  console.log("> WrappedFtm address:", wrappedFtm.address);
};

export default func;
func.tags = ["WFTM"];
