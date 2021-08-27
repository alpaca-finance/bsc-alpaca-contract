import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades, network } from "hardhat";
import { Timelock__factory, Vault__factory } from "../../../../typechain";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";

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
  const TARGETED_VAULTS = ["ibWBNB", "ibBUSD", "ibETH", "ibALPACA", "ibUSDT", "ibBTCB", "ibTUSD"];
  const EXACT_ETA = "1629957600";

  /*




  
  */

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);
  const toBeUpgradedVaults = TARGETED_VAULTS.map((tv) => {
    const vault = config.Vaults.find((v) => tv == v.symbol);
    if (vault === undefined) {
      throw `error: not found vault with ${tv} symbol`;
    }
    if (vault.config === "") {
      throw `error: not found config address`;
    }

    return vault;
  });

  for (const vault of toBeUpgradedVaults) {
    console.log(`============`);
    console.log(`>> Upgrading Vault at ${vault.symbol} through Timelock + ProxyAdmin`);
    console.log(">> Prepare upgrade & deploy if needed a new IMPL automatically.");
    const NewVaultFactory = (await ethers.getContractFactory("Vault")) as Vault__factory;
    const preparedNewVault = await upgrades.prepareUpgrade(vault.address, NewVaultFactory);
    console.log(`>> Implementation address: ${preparedNewVault}`);
    console.log("✅ Done");

    console.log(`>> Queue tx on Timelock to upgrade the implementation`);
    await timelock.queueTransaction(
      config.ProxyAdmin,
      "0",
      "upgrade(address,address)",
      ethers.utils.defaultAbiCoder.encode(["address", "address"], [vault.address, preparedNewVault]),
      EXACT_ETA
    );
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(
      `await timelock.executeTransaction('${config.ProxyAdmin}', '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], ['${vault.address}','${preparedNewVault}']), ${EXACT_ETA})`
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["UpgradeVault"];
