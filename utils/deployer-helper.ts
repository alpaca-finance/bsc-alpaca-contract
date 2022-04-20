import { Provider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, network } from "hardhat";
import { JsonRpcProvider } from "@ethersproject/providers";
import { HttpNetworkUserConfig } from "hardhat/types";

export async function getDeployer(): Promise<SignerWithAddress> {
  const [defaultDeployer] = await ethers.getSigners();

  if (network.name === "mainnetfork" || network.name === "fantom_mainnetfork") {
    const provider = ethers.getDefaultProvider((network.config as HttpNetworkUserConfig).url) as JsonRpcProvider;
    const signer = provider.getSigner(defaultDeployer.address);
    const mainnetForkDeployer = await SignerWithAddress.create(signer);

    return mainnetForkDeployer;
  }

  return defaultDeployer;
}
