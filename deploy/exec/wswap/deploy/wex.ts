import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { WaultSwapToken__factory } from '../../../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;

  if (network.name !== 'testnet') {
    console.log('This deployment script should be run against testnet only')
    return
  }

  const { deployer } = await getNamedAccounts();

  console.log(">> Deploying Tokens");
  await deploy('WEX', {
    from: deployer,
    contract: 'WaultSwapToken',
    log: true,
    deterministicDeployment: false,
  });


  console.log(">> Minting 1,000,000,000 WEXes")
  const wex = WaultSwapToken__factory.connect(
    (await deployments.get('WEX')).address, (await ethers.getSigners())[0]);
  await wex.mint(deployer, ethers.utils.parseEther('1000000000'), { gasLimit: '210000' });
  console.log("✅ Done")
};

export default func;
func.tags = ['Testnet', 'WaultSwap'];