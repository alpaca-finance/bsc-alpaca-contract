import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { PriceHelper, PriceHelper__factory } from "../../../../typechain";
import { ConfigEntity } from "../../../entities";

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

  const deployer = (await ethers.getSigners())[0];

  const config = ConfigEntity.getConfig();
  const CHAINLINK_ADDRESS = config.Oracle.ChainLinkOracle;
  const USD = config.Tokens.USD;
  console.log(">> Deploying an upgradable PriceHelper contract");
  const PriceHelper = (await ethers.getContractFactory("PriceHelper", deployer)) as PriceHelper__factory;
  const priceHelper = (await upgrades.deployProxy(PriceHelper, [CHAINLINK_ADDRESS, USD])) as PriceHelper;
  await priceHelper.deployed();
  console.log(`>> Deployed at ${priceHelper.address}`);
  console.log("✅ Done");
};

export default func;
func.tags = ["PriceHelper"];
