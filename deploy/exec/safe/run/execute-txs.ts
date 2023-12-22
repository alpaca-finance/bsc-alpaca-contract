import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { getConfig } from "../../../entities/config";
import { getDeployer } from "../../../../utils/deployer-helper";
import { GnosisSafeMultiSigService } from "../../../services/multisig/gnosis-safe";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = getConfig();
  const deployer = await getDeployer();
  const multiSig = new GnosisSafeMultiSigService(56, config.OpMultiSig, deployer);

  await multiSig.executePendingTransactions();
};

export default func;
func.tags = ["RunExecuteTxs"];
