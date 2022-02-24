import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  MockERC20,
  MockERC20__factory,
  SpookyMasterChef__factory,
  SpookyToken__factory,
  TShareRewardPool__factory,
  WaultSwapFactory__factory,
  WaultSwapRouter__factory,
} from "../../../../typechain";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const START_TIME = "";
  const PREMINT_BOO = ethers.utils.parseEther("2000000");
  const BOO_PER_SEC = ethers.utils.parseEther("1");
  const WFTM = "0xE3fEd8069957C9BA105AD97D8C467B93f88fd8A3";

  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying TSHARE");
  const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
  const tshare = (await upgrades.deployProxy(MockERC20, ["TSHARE", "TSHARE", 18])) as MockERC20;
  await tshare.deployTransaction.wait(3);
  console.log("TSHARE:", tshare.address);
  console.log("✅ Done");

  console.log("> Minting TSHARE");
  await (await tshare.mint(deployer.address, ethers.utils.parseEther("888888888888888"))).wait(3);
  console.log("✅ Done");

  console.log("> Deploying TShareRewardPool");
  const TShareRewardPool = (await ethers.getContractFactory("TShareRewardPool", deployer)) as TShareRewardPool__factory;
  const tshareRewardPool = await TShareRewardPool.deploy(tshare.address, START_TIME);
  await tshareRewardPool.deployTransaction.wait(3);
  console.log("TShareRewardPool:", tshareRewardPool.address);
  console.log("✅ Done");

  console.log("> Seed TShareRewardPool liquidity");
  await (await tshare.transfer(tshareRewardPool.address, ethers.utils.parseEther("1000000"))).wait(3);
  console.log("✅ Done");
};

export default func;
func.tags = ["TShareRewardPool"];
