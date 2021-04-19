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
    const MERKLE_ROOT = '0x54be7bbc9d4950685ec4b2fd98d18e092bbd690fff6aa18c3e301ec8653d88f1'; //merkle root ITAM week 1 testnet.
    const FEATURE_TOKEN_ADDRESS = '0xd817BfBE43229134e7127778a96C0180e47c10B4'; // itam token address testnet

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