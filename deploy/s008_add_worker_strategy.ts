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

  const WORKER_ADDR = '0x7D0ea848563F5FA0Ae5C2aF2d8207C01Ea45B0D2';
  const STRATEGY_ADDRS = [
    '0xE38EBFE8F314dcaD61d5aDCB29c1A26F41BEd0Be',
    '0xE574dc08aa579720Dfacd70D3DAE883d29874599'
  ];











  const worker = IWorker__factory.connect(
    WORKER_ADDR, (await ethers.getSigners())[0]);

  console.log(">> Setting Strategy for a Worker");
  await worker.setStrategyOk(STRATEGY_ADDRS, true);
  console.log("✅ Done");
};

export default func;
func.tags = ['AddWorkerStrategy'];