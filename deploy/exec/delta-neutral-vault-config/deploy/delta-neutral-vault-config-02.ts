import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { DeltaNeutralVaultConfig02 } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
import { UpgradeableContractDeployer } from "../../../deployer";
import { ConfigFileHelper } from "../../../helper";
import { BlockScanGasPrice } from "../../../services/gas-price/blockscan";

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

  const deployer = await getDeployer();

  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  // use to write config file
  const DELTA_VAULT_SYMBOL = "n8x-BNBUSDT-PCS2";
  const REBALANCE_FACTOR = "9000";
  const POSITION_VALUE_TOLERANCE_BPS = "120";
  const DEBT_RATIO_TOLERANCE_BPS = "30";
  const ALPACA_REINVEST_FEE_TREASURY = "0x417D3e491cbAaD07B2433781e50Bc6Cd09641BC0";
  const ALPACA_BOUNTY_BPS = "1500";
  const LEVERAGE_LEVEL = 8;
  const WHITELIST_REBALANCE = ["0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De"];
  const WHITELIST_REINVEST = ["0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De"];
  const REINVEST_PATH = ["ALPACA", "BUSD"];
  const SWAP_ROUTER_ADDR = config.YieldSources.Pancakeswap!.RouterV2;
  const VALUE_LIMIT = "25000000";
  const DEPOSIT_FEE_TREASURY = "0x417D3e491cbAaD07B2433781e50Bc6Cd09641BC0";
  const DEPOSIT_FEE_BPS = "0";
  const WITHDRAWAL_FEE_TREASURY = "0x417D3e491cbAaD07B2433781e50Bc6Cd09641BC0";
  const WITHDRAWAL_FEE_BPS = "14";
  const MANAGEMENT_TREASURY = "0x7E2308437c2f4C8934214663dc8476037625a270";
  const MANAGEMENT_FEE_PER_SEC = "634195840";
  const ALPACA_BENEFICIARY = "0x44B3868cbba5fbd2c5D8d1445BDB14458806B3B4";
  const ALPACA_BENEFICIARY_FEE_BPS = "5333";
  const FAIR_LAUNCH_ADDR = config.FairLaunch!.address;
  const WRAP_NATIVE_ADDR = config.Tokens.WBNB;
  const WNATIVE_RELAYER = config.SharedConfig.WNativeRelayer;

  const alpacaTokenAddress = config.Tokens.ALPACA;
  const tokenList: any = config.Tokens;
  const gasPriceService = new BlockScanGasPrice(network.name);
  const fastGasPrice = await gasPriceService.getFastGasPrice();
  // validate reinvest tokens
  const reinvestPath: Array<string> = REINVEST_PATH.map((p) => {
    const addr = tokenList[p];
    if (addr === undefined) {
      throw `error: path: unable to find address of ${p}`;
    }
    return addr;
  });

  const deltaNeutralVaultConfigDeployer = new UpgradeableContractDeployer<DeltaNeutralVaultConfig02>(
    deployer,
    "DeltaNeutralVaultConfig02"
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
  await deltaNeutralVaultConfig.setValueLimit(limitValue, { nonce: nonce++, gasPrice: fastGasPrice });
  console.log("✅ Done");

  console.log(`>> Setting Leverage Level`);
  await deltaNeutralVaultConfig.setLeverageLevel(LEVERAGE_LEVEL, { nonce: nonce++, gasPrice: fastGasPrice });
  console.log("✅ Done");

  console.log(`>> Setting Whitelist Rebalance`);
  await deltaNeutralVaultConfig.setWhitelistedRebalancer(WHITELIST_REBALANCE, true, {
    nonce: nonce++,
    gasPrice: fastGasPrice,
  });
  console.log("✅ Done");

  console.log(`>> Setting Whitelist Reinvest`);
  await deltaNeutralVaultConfig.setwhitelistedReinvestors(WHITELIST_REINVEST, true, {
    nonce: nonce++,
    gasPrice: fastGasPrice,
  });
  console.log("✅ Done");

  console.log(`>> Setting Reinvest Path`);
  await deltaNeutralVaultConfig.setReinvestPath(reinvestPath, {
    nonce: nonce++,
    gasLimit: 1000000,
    gasPrice: fastGasPrice,
  });
  console.log("✅ Done");

  console.log(`>> Setting Swap Router`);
  await deltaNeutralVaultConfig.setSwapRouter(SWAP_ROUTER_ADDR, { nonce: nonce++, gasPrice: fastGasPrice });
  console.log("✅ Done");

  console.log(`>> Setting Fees`);
  await deltaNeutralVaultConfig.setFees(
    DEPOSIT_FEE_TREASURY,
    DEPOSIT_FEE_BPS,
    WITHDRAWAL_FEE_TREASURY,
    WITHDRAWAL_FEE_BPS,
    MANAGEMENT_TREASURY,
    MANAGEMENT_FEE_PER_SEC,
    { nonce: nonce++, gasPrice: fastGasPrice }
  );
  console.log("✅ Done");

  console.log(">> Setting ALPACA bounty");
  await deltaNeutralVaultConfig.setAlpacaBountyConfig(ALPACA_REINVEST_FEE_TREASURY, ALPACA_BOUNTY_BPS, {
    nonce: nonce++,
    gasPrice: fastGasPrice,
  });
  console.log("✅ Done");

  console.log(">> Setting ALPACA beneficiacy");
  await deltaNeutralVaultConfig.setAlpacaBeneficiaryConfig(ALPACA_BENEFICIARY, ALPACA_BENEFICIARY_FEE_BPS, {
    nonce: nonce++,
    gasPrice: fastGasPrice,
  });

  if (DELTA_VAULT_SYMBOL) {
    // if not force DELTA_VAULT_SYMBOL config address should set in delta neutral vault deployment script
    config = configFileHelper.addOrSetDeltaNeutralVaultsConfig(DELTA_VAULT_SYMBOL, deltaNeutralVaultConfig.address);
  }
};

export default func;
func.tags = ["DeltaNeutralVaultConfig02"];
