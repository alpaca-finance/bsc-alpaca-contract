import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { network, ethers } from "hardhat";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";
import { TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";

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
  const TITLE = "testnet_set_whitelisted_callers";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    {
      VAULT_SYMBOL: "ibWBNB",
      WHITELISTED_CALLERS: ["0x30903486f9b438c4dd0Db38bf8C7dF9B193971F9"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      WHITELISTED_CALLERS: ["0x30903486f9b438c4dd0Db38bf8C7dF9B193971F9"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibETH",
      WHITELISTED_CALLERS: ["0x30903486f9b438c4dd0Db38bf8C7dF9B193971F9"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibALPACA",
      WHITELISTED_CALLERS: ["0x30903486f9b438c4dd0Db38bf8C7dF9B193971F9"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      WHITELISTED_CALLERS: ["0x30903486f9b438c4dd0Db38bf8C7dF9B193971F9"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBTCB",
      WHITELISTED_CALLERS: ["0x30903486f9b438c4dd0Db38bf8C7dF9B193971F9"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibTUSD",
      WHITELISTED_CALLERS: ["0x30903486f9b438c4dd0Db38bf8C7dF9B193971F9"],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1639989000";

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

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
        { gasPrice: ethers.utils.parseUnits("15", "gwei") }
      )
    );
  }

  FileService.write(TITLE, timelockTransactions);
};

export default func;
func.tags = ["SetWhitelistedCallers"];
