import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { RevenueTreasury, RevenueTreasury__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = getConfig();

  const TOKEN_ADDRESS = config.Tokens.WFTM!;
  const GRASSHOUSE_ADDRESS = "0xaa2dd961c36c3FC057be8c3d1A3675BB0941bDF9";
  const VAULT_ADDRESS = "0xc1018f4Bba361A1Cc60407835e156595e92EF7Ad";
  const ROUTER_ADDRESS = config.YieldSources.SpookySwap!.SpookyRouter;
  const REMAINING = ethers.utils.parseEther("62471.062297587444765624");
  const SPLITBPS = "5000";
  const REWARD_PATH: string[] = [config.Tokens.WFTM!, config.Tokens.ALPACA!];
  const VAULT_SWAP_PATH: string[] = [config.Tokens.WFTM!];

  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying RevenueTreasury");
  const RevenueTreasury = (await ethers.getContractFactory("RevenueTreasury", deployer)) as RevenueTreasury__factory;
  const revenueTreasury = (await upgrades.deployProxy(RevenueTreasury, [
    TOKEN_ADDRESS,
    GRASSHOUSE_ADDRESS,
    REWARD_PATH,
    VAULT_ADDRESS,
    VAULT_SWAP_PATH,
    ROUTER_ADDRESS,
    REMAINING,
    SPLITBPS,
  ])) as RevenueTreasury;

  await revenueTreasury.deployTransaction.wait(3);
  console.log("RevenueTreasury:", revenueTreasury.address);
  console.log("✅ Done");
};

export default func;
func.tags = ["RevenueTreasury"];
