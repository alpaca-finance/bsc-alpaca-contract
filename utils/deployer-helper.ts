import { Provider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, network } from "hardhat";
import { JsonRpcProvider } from "@ethersproject/providers";
import { HttpNetworkUserConfig } from "hardhat/types";
import { config } from "dotenv";

export async function getDeployer(): Promise<SignerWithAddress> {
  const [defaultDeployer] = await ethers.getSigners();

  if (network.name === "mainnetfork" || network.name === "fantom_mainnetfork") {
    const provider = ethers.getDefaultProvider((network.config as HttpNetworkUserConfig).url) as JsonRpcProvider;
    console.log("networkurl", (network.config as HttpNetworkUserConfig).url);
    const signer = provider.getSigner(process.env.DEPLOYER_ADDRESS);
    const mainnetForkDeployer = await SignerWithAddress.create(signer);

    return mainnetForkDeployer;
  }

  return defaultDeployer;
}

export async function getTimeLock(): Promise<SignerWithAddress> {
  const [defaultDeployer] = await ethers.getSigners();
  if (network.name === "mainnetfork" || network.name === "fantom_mainnetfork") {
    const provider = ethers.getDefaultProvider((network.config as HttpNetworkUserConfig).url) as JsonRpcProvider;
    const signer = provider.getSigner(process.env.TIMELOCK);
    const mainnetForkDeployer = await SignerWithAddress.create(signer);

    return mainnetForkDeployer;
  }

  return defaultDeployer;
}
