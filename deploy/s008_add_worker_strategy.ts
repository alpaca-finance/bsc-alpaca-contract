import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { IWorker__factory, IStrategy__factory, Timelock__factory } from '../typechain'

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

  const WORKER_ADDR = '0xeBdECF3a21D95453A89440A4E32B9559E47073E7';
  const STRATEGY_ADDRS = [
    '0xB2dE0A949E5d5db5172d654BF532f473F79a8498',
    '0x5e2911d70d7a659Da0dA26989F445aeCAC58f2E6'
  ];











  const worker = IWorker__factory.connect(
    WORKER_ADDR, (await ethers.getSigners())[0]);

  console.log(">> Setting Strategy for a Worker");
  await worker.setStrategyOk(STRATEGY_ADDRS, true);
  console.log("✅ Done");
};

export default func;
func.tags = ['AddWorkerStrategy'];