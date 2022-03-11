import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  EmissionForwarder,
  EmissionForwarder__factory,
  ProxyToken__factory,
  Proxy__factory,
} from "../../../../typechain";
import { getConfig } from "../../../entities/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const NAME = "Fantom Emission Forwarder";
  const PROXY_TOKEN_ADDRESS = "";
  const FAIRLAUNCH_POOL_ID = "";
  const ANYSWAP_ROUTER_ADDRESS = "";
  const DESTINATION = "0x838B7F64Fa89d322C563A6f904851A13a164f84C";
  const CHAIN_ID = "250";

  const config = getConfig();
  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying Emission Forwarder");
  const EmissionForwarder = (await ethers.getContractFactory(
    "EmissionForwarder",
    deployer
  )) as EmissionForwarder__factory;
  const emissionForwarder = (await upgrades.deployProxy(EmissionForwarder, [
    NAME,
    config.Tokens.ALPACA!,
    config.FairLaunch!.address,
    FAIRLAUNCH_POOL_ID,
    ANYSWAP_ROUTER_ADDRESS,
    DESTINATION,
    CHAIN_ID,
  ])) as EmissionForwarder;
  await emissionForwarder.deployTransaction.wait(3);
  console.log("EmissionForwarder:", emissionForwarder.address);
  console.log("✅ Done");

  let nonce = await deployer.getTransactionCount();

  console.log("> Setting setOkHolder and transfer ownership of Proxy Token");
  const proxyToken = ProxyToken__factory.connect(PROXY_TOKEN_ADDRESS, deployer);
  await (
    await proxyToken.setOkHolders([emissionForwarder.address, config.FairLaunch!.address], true, { nonce: nonce++ })
  ).wait(3);
  await (await proxyToken.transferOwnership(emissionForwarder.address, { nonce: nonce++ })).wait(3);
  console.log("✅ Done");

  console.log("> Deposit proxy token to FairLaunch");
  await (await emissionForwarder.fairLaunchDeposit({ nonce: nonce++ })).wait(3);
  console.log("✅ Done");
};

export default func;
func.tags = ["EmissionForwarder"];
