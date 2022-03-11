import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { ProxyToken, ProxyToken__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const NAME = "FTM_EMISSION_PROXY_TOKEN";
  const SYMBOL = "FTM_EMISSION_PROXY_TOKEN";

  const config = getConfig();
  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying Proxy Token");
  const ProxyToken = (await ethers.getContractFactory("ProxyToken", deployer)) as ProxyToken__factory;
  const proxyToken = (await upgrades.deployProxy(ProxyToken, [NAME, SYMBOL, config.Timelock])) as ProxyToken;
  await proxyToken.deployTransaction.wait(3);
  console.log("ProxyToken:", proxyToken.address);
  console.log("✅ Done");
};

export default func;
func.tags = ["ProxyToken"];
