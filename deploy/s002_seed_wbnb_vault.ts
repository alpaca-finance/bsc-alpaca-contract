import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { IVault__factory } from '../typechain'
import { ethers } from 'hardhat';

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

  const VAULT_ADDRESS = '0x12A7a7130d9a4CF1D7E87F776C01BC230E5B3E17';
  const MSG_VALUE = ethers.utils.parseEther('1');


  const vault = IVault__factory.connect(
    VAULT_ADDRESS, (await ethers.getSigners())[0]);

  console.log(">> Depositing BNB to Vault");
  await vault.deposit(MSG_VALUE, { value: MSG_VALUE });
  console.log("✅ Done");
};

export default func;
func.tags = ['SeedWBNBVault'];