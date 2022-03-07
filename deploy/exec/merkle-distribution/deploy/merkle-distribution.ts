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
  const MERKLE_ROOT = "0xfa187531f35e9281cf5832abceb976b8cb641f0eb3e59a9053039625507dae1d";
  const FEATURE_TOKEN_ADDRESS = "0x354b3a11D5Ea2DA89405173977E271F58bE2897D";

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
