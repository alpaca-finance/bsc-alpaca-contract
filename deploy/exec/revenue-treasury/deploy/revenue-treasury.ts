import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Address, DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { RevenueTreasury, RevenueTreasury__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = getConfig();

  const TOKEN_ADDRESS = config.Tokens.USDT!;
  const GRASSHOUSE_ADDRESS = "0x6Fee87f744FC612948001b09B2808c87B91dDC3c";
  const VAULT_ADDRESS = "0x158Da805682BdC8ee32d52833aD41E74bb951E59";
  const ROUTER_ADDRESS = config.YieldSources.Pancakeswap!.RouterV2;
  const REMAINING = ethers.utils.parseEther("24000");
  const SPLITBPS = "5000";
  const REWARD_PATH = [config.Tokens.USDT!, config.Tokens.BUSD!, config.Tokens.ALPACA!] as string[];
  const VAULT_SWAP_PATH = [] as string[];

  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying RevenueTreasury");
  const RevenueTreasury = (await ethers.getContractFactory("RevenueTreasury", deployer)) as RevenueTreasury__factory;
  const revenueTreasury = (await upgrades.deployProxy(RevenueTreasury, [
    TOKEN_ADDRESS,
    GRASSHOUSE_ADDRESS,
    VAULT_ADDRESS,
    ROUTER_ADDRESS,
    REMAINING,
    SPLITBPS,
  ])) as RevenueTreasury;

  await revenueTreasury.deployTransaction.wait(3);
  console.log("RevenueTreasury:", revenueTreasury.address);
  console.log("✅ Done");

  if (REWARD_PATH.length > 0) {
    console.log("> RevenueTreasury setRewardPath");
    const setRewardPathTx = await revenueTreasury.setRewardPath(REWARD_PATH);
    await setRewardPathTx.wait(3);
  }

  if (VAULT_SWAP_PATH.length > 0) {
    console.log("> RevenueTreasury setVaultSwapPath");
    const setVaultSwapPath = await revenueTreasury.setVaultSwapPath(VAULT_SWAP_PATH);
    await setVaultSwapPath.wait(3);
  }
  console.log("✅ Done");
};

export default func;
func.tags = ["RevenueTreasury"];
