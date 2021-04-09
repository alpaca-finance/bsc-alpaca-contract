import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { PancakeMasterChef__factory, CakeToken__factory, SyrupBar__factory, PancakeFactory__factory, MockERC20__factory } from '../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;

  if (network.name !== 'testnet') {
    console.log('This deployment script should be run against testnet only')
    return
  }

  const { deployer } = await getNamedAccounts();

  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther('40');
  await deploy('PancakeMasterChef', {
    from: deployer,
    contract: 'PancakeMasterChef',
    args: [
      (await deployments.get('CAKE')).address,
      (await deployments.get('SYRUP')).address,
      deployer,
      CAKE_REWARD_PER_BLOCK,
      0,
    ],
    log: true,
    deterministicDeployment: false,
  });

  const factory = PancakeFactory__factory.connect(
    (await deployments.get('PancakeFactory')).address, (await ethers.getSigners())[0]);
  const pancakeMasterchef = PancakeMasterChef__factory.connect(
    (await deployments.get('PancakeMasterChef')).address, (await ethers.getSigners())[0]);
  const cake = CakeToken__factory.connect(
    (await deployments.get('CAKE')).address, (await ethers.getSigners())[0]);
  const syrup = SyrupBar__factory.connect(
    (await deployments.get('SYRUP')).address, (await ethers.getSigners())[0]);
  const wbnb = MockERC20__factory.connect(
    (await deployments.get('WBNB')).address, (await ethers.getSigners())[0]);
  const btcb = MockERC20__factory.connect(
    (await deployments.get('BTCB')).address, (await ethers.getSigners())[0]);
  const eth = MockERC20__factory.connect(
    (await deployments.get('ETH')).address, (await ethers.getSigners())[0]);
  const usdt = MockERC20__factory.connect(
    (await deployments.get('USDT')).address, (await ethers.getSigners())[0]);
  const busd = MockERC20__factory.connect(
    (await deployments.get('BUSD')).address, (await ethers.getSigners())[0]);

  console.log(">> Transferring cake token ownership to MasterChef");
  await cake.transferOwnership(pancakeMasterchef.address, { gasLimit: '210000' });
  console.log("✅ Done")

  console.log(">> Transferring syrup token ownership to MasterChef");
  await syrup.transferOwnership(pancakeMasterchef.address, { gasLimit: '210000' });
  console.log("✅ Done")

  const cakewbnbLp = await factory.getPair(cake.address, wbnb.address)
  console.log(">> CAKE-WBNB LP: ", cakewbnbLp)
  await pancakeMasterchef.add(1000, cakewbnbLp, true)

  const btcbwbnbLp = await factory.getPair(btcb.address, wbnb.address)
  console.log(">> BTCB-WBNB LP: ", btcbwbnbLp)
  await pancakeMasterchef.add(1000, btcbwbnbLp, true)

  const ethwbnbLp = await factory.getPair(eth.address, wbnb.address)
  console.log(">> ETH-WBNB LP: ", ethwbnbLp)
  await pancakeMasterchef.add(1000, ethwbnbLp, true)

  const usdtbusdLp = await factory.getPair(usdt.address, busd.address)
  console.log(">> USDT-BUSD LP: ", usdtbusdLp)
  await pancakeMasterchef.add(1000, usdtbusdLp, true)

  const wbnbbusdLp = await factory.getPair(wbnb.address, busd.address)
  console.log(">> WBNB-BUSD LP: ", wbnbbusdLp)
  await pancakeMasterchef.add(1000, wbnbbusdLp, true)
};

export default func;
func.tags = ['Testnet'];