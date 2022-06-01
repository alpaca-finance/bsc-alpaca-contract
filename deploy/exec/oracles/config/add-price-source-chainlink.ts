import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { ChainLinkPriceOracle__factory } from "../../../../typechain";
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
  const TOKEN0_SYMBOLS = ["WBNB"];
  const TOKEN1_SYMBOLS = ["USDC"];
  const AGGREGATORV3S = ["0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE"];

  const config = getConfig();
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

  const chainLinkPriceOracle = ChainLinkPriceOracle__factory.connect(
    config.Oracle.ChainLinkOracle,
    (await ethers.getSigners())[0]
  );
  console.log(">> Adding price source to chain link price oracle");
  await chainLinkPriceOracle.setPriceFeeds(token0Addrs, token1Addrs, AGGREGATORV3S);
  console.log("✅ Done");
};

export default func;
func.tags = ["AddSourceChainLinkPriceOracle"];
