import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { 
  WexMaster__factory,
  WaultSwapToken__factory,
} from '../../../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;

  if (network.name !== 'testnet') {
    console.log('This deployment script should be run against testnet only')
    return
  }

  const { deployer } = await getNamedAccounts();

  const WEX_REWARD_PER_BLOCK = ethers.utils.parseEther('1500');

  await deploy('WexMaster', {
    from: deployer,
    contract: 'WexMaster',
    args: [
      (await deployments.get('WEX')).address,
      WEX_REWARD_PER_BLOCK,
      0,
    ],
    log: true,
    deterministicDeployment: false,
  });

  const wexMaster = WexMaster__factory.connect(
    (await deployments.get('WexMaster')).address, (await ethers.getSigners())[0]);
  const wex = WaultSwapToken__factory.connect(
    (await deployments.get('WEX')).address, (await ethers.getSigners())[0]);

  console.log(">> Transferring WEX token mintership to WexMaster");
  await wex.transferMintership(wexMaster.address, { gasLimit: '210000' });

  console.log(">> Transferring WEX token ownership to WexMaster");
  await wex.transferOwnership(wexMaster.address, { gasLimit: '210000' });

  console.log("✅ Done")

};

export default func;
func.tags = ['Testnet', 'WaultSwap'];