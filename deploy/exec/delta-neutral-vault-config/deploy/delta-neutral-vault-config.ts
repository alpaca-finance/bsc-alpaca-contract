import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { DeltaNeutralVaultConfig, DeltaNeutralVaultConfig__factory } from "../../../../typechain";
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
  const config = ConfigEntity.getConfig();

  const REBALANCE_FACTOR = "6600";
  const POSITION_VALUE_TOLERANCE_BPS = "100";
  const TREASURY_ADDR = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const ALPACA_BOUNTY_BPS = "1500";
  const LEVERAGE_LEVEL = 3;
  const WHITELIST_REBALANCE = ["0xcf28b4da7d3ed29986831876b74af6e95211d3f9"];
  const WHITELIST_REINVEST = ["0xcf28b4da7d3ed29986831876b74af6e95211d3f9"];
  const REINVEST_PATH = ["ALPACA", "BUSD"];
  const SWAP_ROUTER_ADDR = config.YieldSources.Pancakeswap!.RouterV2;
  const VALUE_LIMIT = "30000";
  const DEPOSIT_FEE_BPS = "";
  const WITHDRAWAL_FEE_BPS = "2";
  const MANAGEMENT_FEE_PER_SEC = "634195839";

  const deployer = (await ethers.getSigners())[0];
  const WRAP_NATIVE_ADDR = config.Tokens.WBNB;
  const WNATIVE_RELAYER = config.SharedConfig.WNativeRelayer;
  const FAIR_LAUNCH_ADDR = config.FairLaunch!.address;

  console.log(">> Deploying an upgradable DeltaNeutralVaultConfig contract");
  const alpacaTokenAddress = config.Tokens.ALPACA;
  const tokenList: any = config.Tokens;
  const reinvestPath: Array<string> = REINVEST_PATH.map((p) => {
    const addr = tokenList[p];
    if (addr === undefined) {
      throw `error: path: unable to find address of ${p}`;
    }
    return addr;
  });
  const DeltaNeutralVaultConfig = (await ethers.getContractFactory(
    "DeltaNeutralVaultConfig",
    deployer
  )) as DeltaNeutralVaultConfig__factory;
  const deltaNeutralVaultConfig = (await upgrades.deployProxy(DeltaNeutralVaultConfig, [
    WRAP_NATIVE_ADDR,
    WNATIVE_RELAYER,
    FAIR_LAUNCH_ADDR,
    REBALANCE_FACTOR,
    POSITION_VALUE_TOLERANCE_BPS,
    TREASURY_ADDR,
    ALPACA_BOUNTY_BPS,
    alpacaTokenAddress,
  ])) as DeltaNeutralVaultConfig;
  await deltaNeutralVaultConfig.deployTransaction.wait(3);
  console.log(`>> Deployed at ${deltaNeutralVaultConfig.address}`);
  console.log("✅ Done");

  let nonce = await deployer.getTransactionCount();

  console.log(`>> Setting Value limit`);
  const limitValue = ethers.utils.parseEther(VALUE_LIMIT);
  await deltaNeutralVaultConfig.setValueLimit(limitValue, { nonce: nonce++ });
  console.log("✅ Done");

  console.log(`>> Setting Leverage Level`);
  await deltaNeutralVaultConfig.setLeverageLevel(LEVERAGE_LEVEL, { nonce: nonce++ });
  console.log("✅ Done");

  console.log(`>> Setting Whitelist Rebalance`);
  await deltaNeutralVaultConfig.setWhitelistedRebalancer(WHITELIST_REBALANCE, true, { nonce: nonce++ });
  console.log("✅ Done");

  console.log(`>> Setting Whitelist Reinvest`);
  await deltaNeutralVaultConfig.setwhitelistedReinvestors(WHITELIST_REINVEST, true, { nonce: nonce++ });
  console.log("✅ Done");

  console.log(`>> Setting Reinvest Path`);
  await deltaNeutralVaultConfig.setReinvestPath(reinvestPath, { nonce: nonce++, gasLimit: 1000000 });
  console.log("✅ Done");

  console.log(`>> Setting Swap Router`);
  await deltaNeutralVaultConfig.setSwapRouter(SWAP_ROUTER_ADDR, { nonce: nonce++ });
  console.log("✅ Done");
};

export default func;
func.tags = ["DeltaNeutralVaultConfig"];
