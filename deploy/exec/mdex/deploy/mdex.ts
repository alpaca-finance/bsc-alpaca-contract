import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import {
  BSCPool__factory,
  MdexFactory__factory,
  MdexRouter__factory,
  MdxToken__factory,
  Oracle__factory,
  SwapMining__factory,
} from "../../../../typechain";
import { getConfig } from "../../../entities/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const MDX_PER_BLOCK = ethers.utils.parseEther("100");
  const MDX_START_BLOCK = "12353000";

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const config = getConfig();

  if (network.name !== "testnet") {
    console.log("This deployment script should be run against testnet only");
    return;
  }

  // Deploy MdexFactory
  console.log(">> Deploy MdexFactory");
  const MdexFactory = (await ethers.getContractFactory("MdexFactory", deployer)) as MdexFactory__factory;
  const factory = await MdexFactory.deploy(deployerAddress);
  await factory.deployed();
  await factory.setFeeRateNumerator(25);
  await factory.setFeeTo(deployerAddress);
  console.log(`>> MdexFactory is deployed at: ${factory.address}`);

  // Deploy MdexRouter
  console.log(">> Deploy MdexRouter");
  const MdexRouter = (await ethers.getContractFactory("MdexRouter", deployer)) as MdexRouter__factory;
  const router = await MdexRouter.deploy(factory.address, config.Tokens.WBNB!);
  await router.deployed();
  console.log(`>> MdexRouter is deployed at: ${router.address}`);

  // Deploy MdxToken
  console.log(">> Deploy MdxToken");
  const MdxToken = (await ethers.getContractFactory("MdxToken", deployer)) as MdxToken__factory;
  const mdx = await MdxToken.deploy();
  await mdx.deployed();
  await mdx.addMinter(deployerAddress);
  console.log(`>> MdxToken is deployed at: ${mdx.address}`);

  // Deploy Oracle
  const Oracle = (await ethers.getContractFactory("Oracle", deployer)) as Oracle__factory;
  const oracle = await Oracle.deploy(factory.address);
  await oracle.deployed();
  console.log(`>> Oracle is deployed at: ${oracle.address}`);

  /// Deploy BSCPool
  const BSCPool = (await ethers.getContractFactory("BSCPool", deployer)) as BSCPool__factory;
  const bscPool = await BSCPool.deploy(mdx.address, MDX_PER_BLOCK, MDX_START_BLOCK);
  await bscPool.deployed();
  console.log(`>> BSC Pool is deployed at: ${bscPool.address}`);

  // Mdex SwapMinig
  const SwapMining = (await ethers.getContractFactory("SwapMining", deployer)) as SwapMining__factory;
  const swapMining = await SwapMining.deploy(
    mdx.address,
    factory.address,
    oracle.address,
    router.address,
    config.Tokens.USDT!,
    MDX_PER_BLOCK,
    MDX_START_BLOCK
  );
  await swapMining.deployed();

  // set swapMining to router
  await router.setSwapMining(swapMining.address);

  /// Setup BTOKEN-FTOKEN pair on Mdex
  await mdx.addMinter(swapMining.address);

  // Transfer ownership so masterChef can mint Mdx
  await mdx.addMinter(bscPool.address);

  console.log(">> Mdex is deployed!");
};

export default func;
func.tags = ["TestnetMdex"];
