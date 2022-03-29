import { DeltaNeutralOracle__factory } from "./../../../../typechain/factories/DeltaNeutralOracle__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ChainlinkPriceOracle2__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";
import { getDeployer } from "../../../../utils/deployer-helper";

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
  // docs : https://docs.chain.link/docs/fantom-price-feeds/
  const TOKEN0_SYMBOLS = ["WFTM", "USDC"];
  const TOKEN1_SYMBOLS = ["USD", "USD"];
  const AGGREGATORV3S = [
    ["0xf4766552D15AE4d256Ad41B6cf2933482B0680dc"],
    ["0x2553f4eeb82d5A26427b8d1106C51499CBa5D99c"],
  ];

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

  const chainlinkPriceOracle2 = ChainlinkPriceOracle2__factory.connect(
    config.Oracle.ChainLinkOracle,
    await getDeployer()
  );

  const transaction = await chainlinkPriceOracle2.setPriceFeeds(token0Addrs, token1Addrs, AGGREGATORV3S);
  await transaction.wait(3);
  console.log("✅ Done");
};

export default func;
func.tags = ["AddSourceChainlinkPriceOracle2"];
