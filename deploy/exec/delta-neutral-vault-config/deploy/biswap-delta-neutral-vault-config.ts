import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { DeltaNeutralVaultConfig } from "../../../../typechain";
import { ConfigEntity } from "../../../entities";
import { getDeployer } from "../../../../utils/deployer-helper";
import { UpgradeableContractDeployer } from "../../../deployer";

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

  const REBALANCE_FACTOR = "6800";
  const POSITION_VALUE_TOLERANCE_BPS = "100";
  const DEBT_RATIO_TOLERANCE_BPS = "30";
  const ALPACA_REINVEST_FEE_TREASURY = "changeme";
  const ALPACA_BOUNTY_BPS = "1500";
  const LEVERAGE_LEVEL = 3;
  const WHITELIST_REBALANCE = ["0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De"];
  const WHITELIST_REINVEST = ["0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De"];
  const REINVEST_PATH = ["ALPACA", "BUSD"];
  const SWAP_ROUTER_ADDR = config.YieldSources.Biswap!.BiswapRouterV2;
  const VALUE_LIMIT = "20000000";
  const DEPOSIT_FEE_TREASURY = "changeme";
  const DEPOSIT_FEE_BPS = "0";
  const WITHDRAWAL_FEE_TREASURY = "changeme";
  const WITHDRAWAL_FEE_BPS = "20";
  const MANAGEMENT_TREASURY = "changeme";
  const MANAGEMENT_FEE_PER_SEC = "634195840";
  const ALPACA_BENEFICIARY = "0x08B5A95cb94f926a8B620E87eE92e675b35afc7E";
  const ALPACA_BENEFICIARY_FEE_BPS = "5333";
  const FAIR_LAUNCH_ADDR = config.FairLaunch!.address;
  const WRAP_NATIVE_ADDR = config.Tokens.WBNB;

  const deployer = await getDeployer();
  const WNATIVE_RELAYER = config.SharedConfig.WNativeRelayer;

  const alpacaTokenAddress = config.Tokens.ALPACA;
  const tokenList: any = config.Tokens;
  // validate reinvest tokens
  const reinvestPath: Array<string> = REINVEST_PATH.map((p) => {
    const addr = tokenList[p];
    if (addr === undefined) {
      throw `error: path: unable to find address of ${p}`;
    }
    return addr;
  });

  const deltaNeutralVaultConfigDeployer = new UpgradeableContractDeployer<DeltaNeutralVaultConfig>(
    deployer,
    "DeltaNeutralVaultConfig"
  );

  const { contract: deltaNeutralVaultConfig } = await deltaNeutralVaultConfigDeployer.deploy([
    WRAP_NATIVE_ADDR,
    WNATIVE_RELAYER,
    FAIR_LAUNCH_ADDR,
    REBALANCE_FACTOR,
    POSITION_VALUE_TOLERANCE_BPS,
    DEBT_RATIO_TOLERANCE_BPS,
    DEPOSIT_FEE_TREASURY,
    MANAGEMENT_TREASURY,
    WITHDRAWAL_FEE_TREASURY,
    alpacaTokenAddress,
  ]);

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

  console.log(`>> Setting Fees`);
  await deltaNeutralVaultConfig.setFees(
    DEPOSIT_FEE_TREASURY,
    DEPOSIT_FEE_BPS,
    WITHDRAWAL_FEE_TREASURY,
    WITHDRAWAL_FEE_BPS,
    MANAGEMENT_TREASURY,
    MANAGEMENT_FEE_PER_SEC,
    { nonce: nonce++ }
  );
  console.log("✅ Done");

  console.log(">> Setting ALPACA bounty");
  await deltaNeutralVaultConfig.setAlpacaBountyConfig(ALPACA_REINVEST_FEE_TREASURY, ALPACA_BOUNTY_BPS, {
    nonce: nonce++,
  });
  console.log("✅ Done");

  console.log(">> Setting ALPACA beneficiacy");
  await deltaNeutralVaultConfig.setAlpacaBeneficiaryConfig(ALPACA_BENEFICIARY, ALPACA_BENEFICIARY_FEE_BPS, {
    nonce: nonce++,
  });
};

export default func;
func.tags = ["BiswapDeltaNeutralVaultConfig"];
