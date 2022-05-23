import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  DebtToken,
  DebtToken__factory,
  MockERC20__factory,
  Vault,
  Vault__factory,
  WNativeRelayer,
  WNativeRelayer__factory,
} from "../../../../typechain";
import { ethers, upgrades } from "hardhat";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";

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
  const TITLE = "cake_vault";
  const ALLOC_POINT_FOR_DEPOSIT = 0;
  const ALLOC_POINT_FOR_OPEN_POSITION = 0;
  const VAULT_NAME = "CAKE Vault";
  const NAME = "Interest Bearing CAKE";
  const SYMBOL = "ibCAKE";
  const DEBT_FAIR_LAUNCH_PID = "27";
  const EXACT_ETA = "1652850000";

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
  const targetedVault = config.Vaults.find((v) => v.symbol === SYMBOL);
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
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
  const baseToken = MockERC20__factory.connect(baseTokenAddr, deployer);
  const baseTokenDecimals = await baseToken.decimals();

  console.log(`>> Deploying debt${SYMBOL}`);
  const DebtToken = (await ethers.getContractFactory("DebtToken", deployer)) as DebtToken__factory;
  const debtToken = (await upgrades.deployProxy(DebtToken, [
    `debt${SYMBOL}_V2`,
    `debt${SYMBOL}_V2`,
    baseTokenDecimals,
    config.Timelock,
  ])) as DebtToken;
  await debtToken.deployTransaction.wait(3);
  console.log(`>> Deployed at ${debtToken.address}`);

  console.log(`>> Deploying an upgradable Vault contract for ${VAULT_NAME}`);
  const Vault = (await ethers.getContractFactory("Vault", deployer)) as Vault__factory;
  const vault = (await upgrades.deployProxy(Vault, [
    targetedVault.config,
    baseTokenAddr,
    NAME,
    SYMBOL,
    baseTokenDecimals,
    debtToken.address,
  ])) as Vault;
  await vault.deployTransaction.wait(3);
  console.log(`>> Deployed at ${vault.address}`);

  let nonce = await deployer.getTransactionCount();

  console.log(">> Set okHolders on DebtToken to be be Vault");
  await debtToken.setOkHolders([vault.address, config.FairLaunch!.address], true, { nonce: nonce++ });
  console.log("✅ Done");

  console.log(">> Transferring ownership of debtToken to Vault");
  await debtToken.transferOwnership(vault.address, { nonce: nonce++ });
  console.log("✅ Done");

  timelockTransactions.push(
    await TimelockService.queueTransaction(
      "Queue Transaction to add a debtToken pool through Timelock",
      config.Shield!,
      "0",
      "addPool(uint256,address,bool)",
      ["uint256", "address", "bool"],
      [ALLOC_POINT_FOR_OPEN_POSITION, debtToken.address, true],
      EXACT_ETA,
      { nonce: nonce++ }
    )
  );

  console.log(">> link pool with vault");
  await vault.setFairLaunchPoolId(DEBT_FAIR_LAUNCH_PID, { gasLimit: "2000000", nonce: nonce++ });
  console.log("✅ Done");

  timelockTransactions.push(
    await TimelockService.queueTransaction(
      `>> Queue Transaction to add a ${SYMBOL} pool through Timelock`,
      config.Shield!,
      "0",
      "addPool(uint256,address,bool)",
      ["uint256", "address", "bool"],
      [ALLOC_POINT_FOR_DEPOSIT, vault.address, true],
      EXACT_ETA,
      { nonce: nonce++ }
    )
  );

  const wNativeRelayer = WNativeRelayer__factory.connect(
    config.SharedConfig.WNativeRelayer,
    deployer
  ) as WNativeRelayer;

  console.log(">> Whitelisting Vault on WNativeRelayer Contract");
  await wNativeRelayer.setCallerOk([vault.address], true, { nonce: nonce++ });
  console.log("✅ Done");

  const ts = Math.floor(Date.now() / 1000);
  fileService.writeJson(`${ts}_${TITLE}.json`, timelockTransactions);
};

export default func;
func.tags = ["Vault"];
