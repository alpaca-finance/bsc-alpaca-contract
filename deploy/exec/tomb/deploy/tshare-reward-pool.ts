import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { MockERC20, MockERC20__factory, TShareRewardPool__factory } from "../../../../typechain";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const START_TIME = "1645506000";

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
  await (await tshare.transfer(tshareRewardPool.address, await tshareRewardPool.TOTAL_REWARDS())).wait(3);
  console.log("✅ Done");
};

export default func;
func.tags = ["TShareRewardPool"];
