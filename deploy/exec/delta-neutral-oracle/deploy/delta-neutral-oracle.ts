import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { DeltaNeutralOracle, DeltaNeutralOracle__factory } from "../../../../typechain";
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
  console.log(">> Deploying an upgradable DeltaNeutralOracle contract");
  const DeltaNeutralOracle = (await ethers.getContractFactory(
    "DeltaNeutralOracle",
    deployer
  )) as DeltaNeutralOracle__factory;
  const deltaNeutralOracle = (await upgrades.deployProxy(DeltaNeutralOracle, [
    CHAINLINK_ADDRESS,
    USD,
  ])) as DeltaNeutralOracle;
  await deltaNeutralOracle.deployed();
  console.log(`>> Deployed at ${deltaNeutralOracle.address}`);
  console.log("✅ Done");
};

export default func;
func.tags = ["DeltaNeutralOracle"];
