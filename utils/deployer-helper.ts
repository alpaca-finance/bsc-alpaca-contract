import { Provider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, network } from "hardhat";
import { JsonRpcProvider } from "@ethersproject/providers";

export async function getDeployer(): Promise<SignerWithAddress> {
  const defaultDeployer = (await ethers.getSigners())[0];

  const provider = ethers.getDefaultProvider(process.env.TENDERLY_FORK_RPC) as JsonRpcProvider;
  const signer = provider.getSigner(process.env.DEPLOYER_ADDRESS);
  const mainnetForkDeployer = await SignerWithAddress.create(signer);

  if (network.name === "mainnetfork" || network.name === "fantom_mainnetfork") {
    return mainnetForkDeployer;
  }

  return defaultDeployer;
}
