import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  DebtToken,
  DebtToken__factory,
  Rewarder1__factory,
  Timelock,
  Timelock__factory,
  Vault,
  Vault__factory,
  WNativeRelayer,
  WNativeRelayer__factory,
} from "../../../../typechain";
import { ethers, upgrades } from "hardhat";
import { ConfigEntity } from "../../../entities";

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

  const ALLOC_POINT_FOR_DEPOSIT = 0;
  const ALLOC_POINT_FOR_OPEN_POSITION = 0;
  const VAULT_NAME = "FTM Vault";
  const NAME = "Interest Bearing FTM";
  const SYMBOL = "ibFTM";
  const DEBT_FAIR_LAUNCH_PID = "0";
  let REWARDER1_ADDRESS = "0x763a687E631A907baDd620E20e9A0869E3Ec543D";
  const EXACT_ETA = "1643259000";

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
  const targetedVault = config.Vaults.find((v) => v.symbol === SYMBOL);
  if (targetedVault === undefined) {
    throw `error: not found any vault with ${SYMBOL} symbol`;
  }
  if (targetedVault.config === "") {
    throw `error: not config address`;
  }

  const tokenList: any = config.Tokens;
  const baseTokenAddr = tokenList[SYMBOL.replace("ib", "")];
  if (baseTokenAddr === undefined) {
    throw `error: not found ${SYMBOL.replace("ib", "")} in tokenList`;
  }

  console.log(`>> Deploying debt${SYMBOL}`);
  const DebtToken = (await ethers.getContractFactory("DebtToken", deployer)) as DebtToken__factory;
  const debtToken = (await upgrades.deployProxy(DebtToken, [
    `debt${SYMBOL}_V2`,
    `debt${SYMBOL}_V2`,
    config.Timelock,
  ])) as DebtToken;
  const debtTokenDeployTx = await debtToken.deployTransaction.wait(3);
  console.log(`>> Deployed block: ${debtTokenDeployTx.blockNumber}`);
  console.log(`>> Deployed at ${debtToken.address}`);

  console.log(`>> Deploying an upgradable Vault contract for ${VAULT_NAME}`);
  const Vault = (await ethers.getContractFactory("Vault", deployer)) as Vault__factory;
  const vault = (await upgrades.deployProxy(Vault, [
    targetedVault.config,
    baseTokenAddr,
    NAME,
    SYMBOL,
    18,
    debtToken.address,
  ])) as Vault;
  const vaultDeployTx = await debtToken.deployTransaction.wait(3);
  console.log(`>> Deployed block: ${vaultDeployTx.blockNumber}`);
  console.log(`>> Deployed at ${vault.address}`);

  let nonce = await deployer.getTransactionCount();

  console.log(">> Set okHolders on DebtToken to be be Vault");
  await debtToken.setOkHolders([vault.address, config.MiniFL!.address], true, { nonce: nonce++ });
  console.log("✅ Done");

  console.log(">> Transferring ownership of debtToken to Vault");
  await debtToken.transferOwnership(vault.address, { nonce: nonce++ });
  console.log("✅ Done");

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]) as Timelock;

  console.log(">> Queue Transaction to add a debtToken pool through Timelock");
  await timelock.queueTransaction(
    config.MiniFL!.address,
    "0",
    "addPool(uint256,address,address,bool)",
    ethers.utils.defaultAbiCoder.encode(
      ["uint256", "address", "address", "bool"],
      [ALLOC_POINT_FOR_OPEN_POSITION, debtToken.address, REWARDER1_ADDRESS, true]
    ),
    EXACT_ETA,
    { nonce: nonce++ }
  );
  console.log("✅ Done");

  console.log(">> Generate timelock executeTransaction");
  console.log(
    `await timelock.executeTransaction('${
      config.MiniFL!.address
    }', '0', 'addPool(uint256,address,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','address','bool'], [${ALLOC_POINT_FOR_OPEN_POSITION}, '${
      debtToken.address
    }', '${REWARDER1_ADDRESS}', true]), ${EXACT_ETA})`
  );
  console.log("✅ Done");

  console.log(">> link pool with vault");
  await vault.setFairLaunchPoolId(DEBT_FAIR_LAUNCH_PID, { gasLimit: "2000000", nonce: nonce++ });
  console.log("✅ Done");

  console.log(`>> Queue Transaction to add a ${SYMBOL} pool through Timelock`);
  await timelock.queueTransaction(
    config.MiniFL!.address,
    "0",
    "addPool(uint256,address,address,bool)",
    ethers.utils.defaultAbiCoder.encode(
      ["uint256", "address", "address", "bool"],
      [ALLOC_POINT_FOR_DEPOSIT, vault.address, REWARDER1_ADDRESS, false]
    ),
    EXACT_ETA,
    { nonce: nonce++ }
  );
  console.log("✅ Done");

  console.log(">> Generate timelock executeTransaction");
  console.log(
    `await timelock.executeTransaction('${
      config.MiniFL!.address
    }', '0', 'addPool(uint256,address,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','address','bool'], [${ALLOC_POINT_FOR_DEPOSIT}, '${
      vault.address
    }', ${REWARDER1_ADDRESS}, false]), ${EXACT_ETA})`
  );
  console.log("✅ Done");

  if (REWARDER1_ADDRESS !== ethers.constants.AddressZero) {
    console.log(
      `>> Add pool ${DEBT_FAIR_LAUNCH_PID} and pool ${DEBT_FAIR_LAUNCH_PID + 1} to rewarder once pool is live`
    );
  }

  const wNativeRelayer = WNativeRelayer__factory.connect(
    config.SharedConfig.WNativeRelayer,
    deployer
  ) as WNativeRelayer;

  console.log(">> Whitelisting Vault on WNativeRelayer Contract");
  await wNativeRelayer.setCallerOk([vault.address], true, { nonce: nonce++ });
  console.log("✅ Done");
};

export default func;
func.tags = ["MiniFL_Vault"];
