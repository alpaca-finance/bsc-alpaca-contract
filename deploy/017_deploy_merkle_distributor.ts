import { ethers } from 'hardhat';
import { MerkleDistributor__factory } from "../typechain"
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
    /*
    ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
    ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
    ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
    ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
    ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
    ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
    Check all variables below before execute the deployment script
    */
    const MERKLE_ROOT = '0x6448eaef682da62f86be2b8c5dbb098b1d2f40cc9b1615b2302c0ef1e619ffda'; //merkle root ITAM week 1 testnet.
    const FEATURE_TOKEN_ADDRESS = '0x04c747b40be4d535fc83d09939fb0f626f32800b'; // itam token address testnet











    


    
    console.log(">> Deploying a Merkle distributor contract");
    const MerkleDistributorContract = (await ethers.getContractFactory(
        "MerkleDistributor",
        (await ethers.getSigners())[0]
    )) as MerkleDistributor__factory;
    const merkleDistributor = await MerkleDistributorContract.deploy(FEATURE_TOKEN_ADDRESS, MERKLE_ROOT);
    await merkleDistributor.deployed();
    console.log(`>> Deployed at ${merkleDistributor.address}`);
    console.log("✅ Done");
};

export default func;
func.tags = ['MerkleDistributor']