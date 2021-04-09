import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { AlpacaToken__factory, FairLaunch__factory } from '../typechain';

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
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther('20');
  const BONUS_MULTIPLIER = 7;
  const BONUS_END_BLOCK = '7650000';
  const BONUS_LOCK_BPS = '7000';
  const START_BLOCK = '7328000';
  const ALPACA_START_RELEASE = '11997210';
  const ALPACA_END_RELEASE = '17181210';














  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy('AlpacaToken', {
    from: deployer,
    args: [
      ALPACA_START_RELEASE,
      ALPACA_END_RELEASE,
    ],
    log: true,
    deterministicDeployment: false,
  });

  const alpacaToken = AlpacaToken__factory.connect(
    (await deployments.get('AlpacaToken')).address, (await ethers.getSigners())[0]);

  await deploy('FairLaunch', {
    from: deployer,
    args: [
      alpacaToken.address,
      deployer,
      ALPACA_REWARD_PER_BLOCK,
      START_BLOCK, BONUS_LOCK_BPS, BONUS_END_BLOCK
    ],
    log: true,
    deterministicDeployment: false,
  })
  const fairLaunch = FairLaunch__factory.connect(
    (await deployments.get('FairLaunch')).address, (await ethers.getSigners())[0])

  console.log(">> Transferring ownership of AlpacaToken from deployer to FairLaunch");
  await alpacaToken.transferOwnership(fairLaunch.address, { gasLimit: '500000' });
  console.log("✅ Done");

  console.log(`>> Set Fair Launch bonus to BONUS_MULTIPLIER: "${BONUS_MULTIPLIER}", BONUS_END_BLOCK: "${BONUS_END_BLOCK}", LOCK_BPS: ${BONUS_LOCK_BPS}`)
  await fairLaunch.setBonus(BONUS_MULTIPLIER, BONUS_END_BLOCK, BONUS_LOCK_BPS)
  console.log("✅ Done");
};

export default func;
func.tags = ['FairLaunch'];