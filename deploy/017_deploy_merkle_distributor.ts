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
    const MERKLE_ROOT = '0xea502307fed1ea2c0333b4b36f950f68df037e1eb425d14a1032e6ba4793f675'; //merkle root ITAM week 1 testnet.
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