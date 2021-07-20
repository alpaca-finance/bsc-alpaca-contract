import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;
  /*
  ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
  ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
  ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
  ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
  ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
  ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
  Check all variables below before execute the deployment script
  */

  const WBNB = '0xDfb1211E2694193df5765d54350e1145FD2404A1';








  const { deployer } = await getNamedAccounts();

  await deploy('WaultSwapFactory', {
    from: deployer,
    args: [
      deployer,
    ],
    log: true,
    deterministicDeployment: false,
  });

  const factory = await deployments.get('WaultSwapFactory');

  await deploy('WaultSwapRouter', {
    from: deployer,
    args: [
      factory.address,
      WBNB,
    ],
    log: true,
    deterministicDeployment: false,
  })
};

export default func;
func.tags = ['Testnet', 'WaultSwap'];