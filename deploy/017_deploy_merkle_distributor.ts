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
    const MERKLE_ROOT = '0xb662e1a23839de3a272894c3d9d45a6e3ec8d6b898c8e23fc92466d22150d3a5'; //merkle root ITAM week 1 testnet.
    const FEATURE_TOKEN_ADDRESS = '0x04C747b40Be4D535fC83D09939fb0f626F32800B'; // itam token address testnet











    


    
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