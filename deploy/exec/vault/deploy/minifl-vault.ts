import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  DebtToken,
  DebtToken__factory,
  MiniFL__factory,
  MockERC20__factory,
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
  const VAULT_NAME = "TOMB Vault";
  const NAME = "Interest Bearing TOMB";
  const SYMBOL = "ibTOMB";
  const REWARDER1_ADDRESS = "0x7EEAA96bf1aBaA206615046c0991E678a2b12Da1";
  const EXACT_ETA = "888888"; // no use due to no timelock

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

  const baseToken = MockERC20__factory.connect(baseTokenAddr, deployer);
  const baseTokenDecimal = await baseToken.decimals();

  console.log(`>> Deploying debt${SYMBOL}`);
  const DebtToken = (await ethers.getContractFactory("DebtToken", deployer)) as DebtToken__factory;
  const debtToken = (await upgrades.deployProxy(DebtToken, [
    `debtIb${SYMBOL.replace("ib", "")}_V2`,
    `debtIb${SYMBOL.replace("ib", "")}_V2`,
    baseTokenDecimal,
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
    baseTokenDecimal,
    debtToken.address,
  ])) as Vault;
  const vaultDeployTx = await vault.deployTransaction.wait(15);
  console.log(`>> Deployed block: ${vaultDeployTx.blockNumber}`);
  console.log(`>> Deployed at ${vault.address}`);

  let nonce = await deployer.getTransactionCount();

  console.log(">> Set okHolders on DebtToken to be be Vault");
  await (await debtToken.setOkHolders([vault.address, config.MiniFL!.address], true, { nonce: nonce++ })).wait(3);
  console.log("✅ Done");

  console.log(">> Transferring ownership of debtToken to Vault");
  await (await debtToken.transferOwnership(vault.address, { nonce: nonce++ })).wait(3);
  console.log("✅ Done");

  const miniFL = MiniFL__factory.connect(config.MiniFL!.address, deployer);
  const expectedDebtTokenPoolId = await miniFL.poolLength();

  console.log(">> Set Debt Pool ID on Vault");
  await (await vault.setFairLaunchPoolId(expectedDebtTokenPoolId, { nonce: nonce++ })).wait(3);
  console.log("✅ Done");

  // If Mini FL is Timelock then handle it
  if ((await miniFL.owner()).toLowerCase() === config.Timelock.toLowerCase()) {
    console.log("MiniFL's owner is Timelock, handle it");

    const timelock = Timelock__factory.connect(config.Timelock, deployer) as Timelock;
    console.log(">> Queue Transaction to add a debtToken pool through Timelock");
    await timelock.queueTransaction(
      config.MiniFL!.address,
      "0",
      "addPool(uint256,address,address,bool,bool)",
      ethers.utils.defaultAbiCoder.encode(
        ["uint256", "address", "address", "bool", "bool"],
        [ALLOC_POINT_FOR_OPEN_POSITION, debtToken.address, REWARDER1_ADDRESS, true, true]
      ),
      EXACT_ETA,
      { nonce: nonce++ }
    );
    console.log("✅ Done");

    console.log(">> Generate timelock executeTransaction");
    console.log(
      `await timelock.executeTransaction('${
        config.MiniFL!.address
      }', '0', 'addPool(uint256,address,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','address','bool','bool'], [${ALLOC_POINT_FOR_OPEN_POSITION}, '${
        debtToken.address
      }', '${REWARDER1_ADDRESS}', true, true]), ${EXACT_ETA})`
    );
    console.log("✅ Done");

    console.log(`>> Queue Transaction to add a ${SYMBOL} pool through Timelock`);
    await timelock.queueTransaction(
      config.MiniFL!.address,
      "0",
      "addPool(uint256,address,address,bool,bool)",
      ethers.utils.defaultAbiCoder.encode(
        ["uint256", "address", "address", "bool", "bool"],
        [ALLOC_POINT_FOR_DEPOSIT, vault.address, REWARDER1_ADDRESS, false, true]
      ),
      EXACT_ETA,
      { nonce: nonce++ }
    );
    console.log("✅ Done");

    console.log(">> Generate timelock executeTransaction");
    console.log(
      `await timelock.executeTransaction('${
        config.MiniFL!.address
      }', '0', 'addPool(uint256,address,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','address','bool','bool'], [${ALLOC_POINT_FOR_DEPOSIT}, '${
        vault.address
      }', ${REWARDER1_ADDRESS}, false, true]), ${EXACT_ETA})`
    );
    console.log("✅ Done");
  } else {
    console.log(">> MiniFL's owner is NOT Timelock, add pool immediately");

    console.log(">> Add a debt token to MiniFL");
    const addDebtTokenPoolTx = await miniFL.addPool(
      ALLOC_POINT_FOR_OPEN_POSITION,
      debtToken.address,
      REWARDER1_ADDRESS,
      true,
      true,
      { nonce: nonce++ }
    );
    await addDebtTokenPoolTx.wait(20);
    console.log("✅ Done");

    console.log(">> Allow vault to stake debt token");
    const approveVaultTx = await miniFL.approveStakeDebtToken([expectedDebtTokenPoolId], [vault.address], true, {
      nonce: nonce++,
    });
    await approveVaultTx.wait(3);
    console.log("✅ Done");

    console.log(`>> Add a ${SYMBOL} to MiniFL`);
    const addIbPoolTx = await miniFL.addPool(ALLOC_POINT_FOR_DEPOSIT, vault.address, REWARDER1_ADDRESS, false, true, {
      nonce: nonce++,
    });
    await addIbPoolTx.wait(3);
    console.log("✅ Done");
  }

  const wNativeRelayer = WNativeRelayer__factory.connect(
    config.SharedConfig.WNativeRelayer,
    deployer
  ) as WNativeRelayer;

  console.log(">> Whitelisting Vault on WNativeRelayer Contract");
  await (await wNativeRelayer.setCallerOk([vault.address], true, { nonce: nonce++ })).wait(3);
  console.log("✅ Done");
};

export default func;
func.tags = ["MiniFL_Vault"];
