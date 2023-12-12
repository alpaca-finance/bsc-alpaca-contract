import { ethers, upgrades } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TreasuryBuybackStrategy__factory, TreasuryBuybackStrategy } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";

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
  const config = getConfig();
  const deployer = await getDeployer();

  const MASTER_CHEF = "0x556B9306565093C855AEA9AE92A594704c2Cd59e";
  const NFT_POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
  const POOL = "0xcfe783e16c9a8C74F2be9BCEb2339769439061Bf"; // USDT-ALPACA
  const ACCUM_TOKEN = config.Tokens.ALPACA!;
  const REVENUE_TREASURY = config.RevenueTreasury!;
  const ROUTER_V3 = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
  const ORACLE = "0x634902128543b25265da350e2d961C7ff540fC71";
  const SLIPPAGE_BPS = 200;

  const TreasuryBuybackStrategy = (await ethers.getContractFactory(
    "TreasuryBuybackStrategy",
    deployer
  )) as TreasuryBuybackStrategy__factory;
  const treasuryBuybackStrategy = (await upgrades.deployProxy(TreasuryBuybackStrategy, [
    MASTER_CHEF,
    NFT_POSITION_MANAGER,
    POOL,
    ACCUM_TOKEN,
    REVENUE_TREASURY,
    ROUTER_V3,
    ORACLE,
    SLIPPAGE_BPS,
  ])) as TreasuryBuybackStrategy;
  await treasuryBuybackStrategy.deployTransaction.wait(3);
  console.log(`>> Deployed at ${treasuryBuybackStrategy.address}`);
};

export default func;
func.tags = ["TreasuryBuybackStrategy"];
