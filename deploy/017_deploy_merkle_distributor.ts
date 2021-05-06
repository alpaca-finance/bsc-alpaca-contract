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
    const MERKLE_ROOT = '0xef84ad67639a8441cfeb7ca9251d98932c241da296f6fe93e7f65e7f759fd06b'; //merkle root ITAM week 1 testnet.
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