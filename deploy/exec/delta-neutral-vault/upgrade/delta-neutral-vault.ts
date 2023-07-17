import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { Converter } from "../../../helper";
import { ProxyAdmin__factory } from "../../../../typechain";
import { compare } from "../../../../utils/address";

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

  const TITLE = "upgrade_terminate_av_02";
  const DELTA_NEUTRAL_VAULT = "TerminateAV02";
  const TARGETED_VAULTS = [
    "L8x-USDTBNB-BSW1", // yes
    "L8x-USDTBNB-PCS1", // yes
    "L3x-BUSDBTCB-PCS1", // yes
    "n3x-BNBUSDT-PCS1", // yes
    "n3x-BNBBUSD-PCS1", // yes
    "n8x-BNBUSDT-PCS1", // yes
    "n8x-BNBUSDT-PCS2", // yes
  ];
  const EXACT_ETA = "1688812200";

  const config = getConfig();

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();

  const converter = new Converter();
  const toBeUpgradedVaults = converter.convertDeltaSymboltoObj(TARGETED_VAULTS);
  let nonce = await deployer.getTransactionCount();
  const chainId = await deployer.getChainId();

  for (const vault of toBeUpgradedVaults) {
    console.log("------------------");
    console.log(`> Upgrading DeltaNeutralVault at ${vault.symbol} through Timelock + ProxyAdmin`);
    console.log("> Prepare upgrade & deploy if needed a new IMPL automatically.");
    const newVault = await ethers.getContractFactory(DELTA_NEUTRAL_VAULT);
    const preparedNewVault = await upgrades.prepareUpgrade(vault.address, newVault);
    console.log(`> Implementation address: ${preparedNewVault.toString()}`);
    console.log("✅ Done");

    const proxyAdmin = ProxyAdmin__factory.connect(config.ProxyAdmin, deployer);

    const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };
    if (compare(await proxyAdmin.owner(), config.Timelock)) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          chainId,
          `> Queue tx to upgrade ${vault.symbol}`,
          config.ProxyAdmin,
          "0",
          "upgrade(address,address)",
          ["address", "address"],
          [vault.address, preparedNewVault],
          EXACT_ETA,
          ops
        )
      );
    } else {
      console.log("> Execute upgrade contract without Timelock");
      await proxyAdmin.upgrade(vault.address, preparedNewVault.toString(), ops);
    }
  }

  const timestamp = Math.floor(Date.now() / 1000);
  fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["UpgradeDeltaNeutralVault"];
