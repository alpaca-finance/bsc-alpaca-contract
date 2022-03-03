import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";
import { getConfig } from "../../../entities/config";

interface IInput {
  VAULT_SYMBOL: string;
  WHITELISTED_CALLERS: string[];
  IS_ENABLE: boolean;
}

interface IDerivedInput {
  configAddress: string;
  whitelistedCallers: string[];
  isEnable: boolean;
}

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
  const TITLE = "testnet_deltaneutral";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    {
      VAULT_SYMBOL: "ibWBNB",
      WHITELISTED_CALLERS: ["0x9AaaD0AB432eFDf86B27b4ea020dF2DfB223e00c"],
      IS_ENABLE: true,
    },
    // {
    //   VAULT_SYMBOL: "ibBUSD",
    //   WHITELISTED_CALLERS: ["0xD283Cc1c165Fe25154458A41a9c1D35107d3a0f2"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibETH",
    //   WHITELISTED_CALLERS: ["0x36488cC6F2E0f96e8814F315BDF4229c9c82d60A"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibALPACA",
    //   WHITELISTED_CALLERS: ["0x36488cC6F2E0f96e8814F315BDF4229c9c82d60A"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibUSDT",
    //   WHITELISTED_CALLERS: ["0xD378d37fA8040370fe42bc732e5B2A169096d3e1"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibBTCB",
    //   WHITELISTED_CALLERS: ["0x36488cC6F2E0f96e8814F315BDF4229c9c82d60A"],
    //   IS_ENABLE: true,
    // },
    {
      VAULT_SYMBOL: "ibTUSD",
      WHITELISTED_CALLERS: ["0x9AaaD0AB432eFDf86B27b4ea020dF2DfB223e00c"],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1646402400";

  const config = getConfig();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = (await ethers.getSigners())[0];
  let nonce = await deployer.getTransactionCount();

  const inputs: Array<IDerivedInput> = TARGETED_VAULT_CONFIG.map((tv) => {
    const vault = config.Vaults.find((v) => tv.VAULT_SYMBOL == v.symbol);
    if (vault === undefined) {
      throw `error: not found vault with ${tv} symbol`;
    }
    if (vault.config === "") {
      throw `error: not found config address`;
    }

    return {
      configAddress: vault.config,
      whitelistedCallers: tv.WHITELISTED_CALLERS,
      isEnable: tv.IS_ENABLE,
    };
  });

  for (const i of inputs) {
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `>> Queue tx on Timelock to setWhitelistedCallers for ${i.configAddress}`,
        i.configAddress,
        "0",
        "setWhitelistedCallers(address[],bool)",
        ["address[]", "bool"],
        [i.whitelistedCallers, i.isEnable],
        EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("15", "gwei"), nonce: nonce++ }
      )
    );
  }

  FileService.write(TITLE, timelockTransactions);
};

export default func;
func.tags = ["SetWhitelistedCallers"];
