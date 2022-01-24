import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import {
  SpookyMasterChef__factory,
  SpookyToken__factory,
  WaultSwapFactory__factory,
  WaultSwapRouter__factory,
} from "../../../../typechain";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const START_TIME = "";
  const PREMINT_BOO = ethers.utils.parseEther("2000000");
  const BOO_PER_SEC = ethers.utils.parseEther("1");
  const WFTM = "0xE3fEd8069957C9BA105AD97D8C467B93f88fd8A3";

  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying SpookyFactory");
  // Note: Use WaultSwap because same swap fee
  // Setup WaultSwap
  const WaultSwapFactory = (await ethers.getContractFactory("WaultSwapFactory", deployer)) as WaultSwapFactory__factory;
  const factory = await WaultSwapFactory.deploy(deployer.address);
  await factory.deployTransaction.wait(3);
  console.log("SpookyFactory:", factory.address);
  console.log("✅ Done");

  console.log("> Deploying SpookyRouter");
  const WaultSwapRouter = (await ethers.getContractFactory("WaultSwapRouter", deployer)) as WaultSwapRouter__factory;
  const router = await WaultSwapRouter.deploy(factory.address, WFTM);
  await router.deployTransaction.wait(3);
  console.log("SpookyRouter:", router.address);
  console.log("✅ Done");

  console.log("> Deploying SpookyToken");
  const SpookyToken = (await ethers.getContractFactory("SpookyToken", deployer)) as SpookyToken__factory;
  const boo = await SpookyToken.deploy();
  await boo.deployTransaction.wait(3);
  console.log("SpookyToken:", boo.address);
  console.log("✅ Done");

  console.log("> Minting some BOO");
  await (await boo.mint(deployer.address, PREMINT_BOO)).wait(3);
  console.log("✅ Done");

  /// Setup MasterChef
  console.log("> Deploying SpookyMasterChef");
  const SpookyMasterChef = (await ethers.getContractFactory("SpookyMasterChef", deployer)) as SpookyMasterChef__factory;
  const spookyMasterChef = await SpookyMasterChef.deploy(boo.address, deployer.address, BOO_PER_SEC, START_TIME);
  await spookyMasterChef.deployTransaction.wait(3);
  console.log("SpookyMasterChef:", spookyMasterChef.address);
  console.log("✅ Done");

  console.log("> Setting BOO ownership as SpookyMasterChef");
  // Transfer ownership so MasterChef can mint BOO
  await (await boo.transferOwnership(spookyMasterChef.address)).wait(3);
  console.log("✅ Done");
};

export default func;
func.tags = ["SpookySwap"];
