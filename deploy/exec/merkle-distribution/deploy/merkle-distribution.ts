import { ethers } from "hardhat";
import { MerkleDistributor__factory } from "../../../../typechain";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

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
  const MERKLE_ROOT = "0xb7808e887f16731a2a13658acb91da3d8f54efe42b80fb6cc450661669eeab94";
  const FEATURE_TOKEN_ADDRESS = "0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F";

  console.log(">> Deploying a Merkle distributor contract");
  const MerkleDistributorContract = (await ethers.getContractFactory(
    "MerkleDistributor",
    (
      await ethers.getSigners()
    )[0]
  )) as MerkleDistributor__factory;
  const merkleDistributor = await MerkleDistributorContract.deploy(FEATURE_TOKEN_ADDRESS, MERKLE_ROOT);
  await merkleDistributor.deployed();
  console.log(`>> Deployed at ${merkleDistributor.address}`);
  console.log("✅ Done");
};

export default func;
func.tags = ["MerkleDistributor"];
