import { ethers, network } from "hardhat";
import { WorkerConfig__factory } from "../../typechain";
import MainnetConfig from "../../.mainnet.json";

async function main() {
  const alpacaDeployerAddress = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  if (network.name !== "mainnetfork") throw new Error("not mainnet fork");
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [alpacaDeployerAddress],
  });

  const alpacaDeployer = await ethers.getSigner(alpacaDeployerAddress);

  console.log(alpacaDeployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
