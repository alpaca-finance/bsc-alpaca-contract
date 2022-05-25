import { Provider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, network } from "hardhat";
import { JsonRpcProvider } from "@ethersproject/providers";
import { HttpNetworkUserConfig } from "hardhat/types";

export async function getDeployer(): Promise<SignerWithAddress> {
  const [defaultDeployer] = await ethers.getSigners();

  if (isFork()) {
    const provider = ethers.getDefaultProvider((network.config as HttpNetworkUserConfig).url) as JsonRpcProvider;
    const signer = provider.getSigner(process.env.DEPLOYER_ADDRESS);
    const mainnetForkDeployer = await SignerWithAddress.create(signer);

    return mainnetForkDeployer;
  }

  return defaultDeployer;
}

export function isFork() {
  switch (network.name) {
    case "mainnetfork":
    case "fantom_mainnetfork":
      return true;
    default:
      return false;
  }
}
