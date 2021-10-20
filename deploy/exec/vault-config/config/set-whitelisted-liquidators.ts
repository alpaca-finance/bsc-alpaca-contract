import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { network } from "hardhat";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";
import { TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";

interface IInput {
  VAULT_SYMBOL: string;
  WHITELISTED_LIQUIDATORS: string[];
  IS_ENABLE: boolean;
}

interface IDerivedInput {
  configAddress: string;
  whitelistedLiquidators: string[];
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
  const TITLE = "vincent_lando";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    {
      VAULT_SYMBOL: "ibWBNB",
      WHITELISTED_LIQUIDATORS: [
        "0x39Ab396f78678A0133bC5c41Ee692A3F707F0D52",
        "0xFf5E59c1f57afD16d75409A3B293C5CAf09D070c",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      WHITELISTED_LIQUIDATORS: [
        "0x39Ab396f78678A0133bC5c41Ee692A3F707F0D52",
        "0xFf5E59c1f57afD16d75409A3B293C5CAf09D070c",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibETH",
      WHITELISTED_LIQUIDATORS: [
        "0x39Ab396f78678A0133bC5c41Ee692A3F707F0D52",
        "0xFf5E59c1f57afD16d75409A3B293C5CAf09D070c",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibALPACA",
      WHITELISTED_LIQUIDATORS: [
        "0x39Ab396f78678A0133bC5c41Ee692A3F707F0D52",
        "0xFf5E59c1f57afD16d75409A3B293C5CAf09D070c",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      WHITELISTED_LIQUIDATORS: [
        "0x39Ab396f78678A0133bC5c41Ee692A3F707F0D52",
        "0xFf5E59c1f57afD16d75409A3B293C5CAf09D070c",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBTCB",
      WHITELISTED_LIQUIDATORS: [
        "0x39Ab396f78678A0133bC5c41Ee692A3F707F0D52",
        "0xFf5E59c1f57afD16d75409A3B293C5CAf09D070c",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibTUSD",
      WHITELISTED_LIQUIDATORS: [
        "0x39Ab396f78678A0133bC5c41Ee692A3F707F0D52",
        "0xFf5E59c1f57afD16d75409A3B293C5CAf09D070c",
      ],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1634803200";

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
      whitelistedLiquidators: tv.WHITELISTED_LIQUIDATORS,
      isEnable: tv.IS_ENABLE,
    };
  });

  for (const i of inputs) {
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `>> Queue tx on Timelock to setWhitelistedLiquidators for ${i.configAddress}`,
        i.configAddress,
        "0",
        "setWhitelistedLiquidators(address[],bool)",
        ["address[]", "bool"],
        [i.whitelistedLiquidators, i.isEnable],
        EXACT_ETA
      )
    );
  }

  FileService.write(TITLE, timelockTransactions);
};

export default func;
func.tags = ["SetWhitelistedLiquidators"];
