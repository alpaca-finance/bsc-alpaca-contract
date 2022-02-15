import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { OracleMedianizer__factory } from "../../../../typechain";
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
  const DEFAULT_MAX_PRICE_DEVIATION = "1000000000000000000";
  const DEFAULT_MAX_PRICE_STALE = "86400";
  const config = ConfigEntity.getConfig();

  const TOKEN0_SYMBOLS = ["WFTM", "WFTM", "TUSD"];
  const TOKEN1_SYMBOLS = ["ETH", "USDC", "USDC"];
  const MAX_PRICE_DEVIATIONS = [DEFAULT_MAX_PRICE_DEVIATION, DEFAULT_MAX_PRICE_DEVIATION, DEFAULT_MAX_PRICE_DEVIATION];
  const MAX_PRICE_STALES = [DEFAULT_MAX_PRICE_STALE, DEFAULT_MAX_PRICE_STALE, DEFAULT_MAX_PRICE_STALE];
  const SOURCES = [[config.Oracle.ChainLinkOracle], [config.Oracle.ChainLinkOracle], [config.Oracle.ChainLinkOracle]];

  const tokenList: any = config.Tokens;
  const token0Addrs: Array<string> = TOKEN0_SYMBOLS.map((t) => {
    const addr = tokenList[t];
    if (addr === undefined) {
      throw `error: token: unable to find address of ${t}`;
    }
    return addr;
  });
  const token1Addrs: Array<string> = TOKEN1_SYMBOLS.map((t) => {
    const addr = tokenList[t];
    if (addr === undefined) {
      throw `error: token: unable to find address of ${t}`;
    }
    return addr;
  });

  const oracleMedianizer = OracleMedianizer__factory.connect(
    config.Oracle.OracleMedianizer,
    (await ethers.getSigners())[0]
  );
  console.log(">> Adding primary source to oracle medianizer");
  await oracleMedianizer.setMultiPrimarySources(
    token0Addrs,
    token1Addrs,
    MAX_PRICE_DEVIATIONS,
    MAX_PRICE_STALES,
    SOURCES
  );
  console.log("✅ Done");
};

export default func;
func.tags = ["AddSourceOracleMedianizer"];
