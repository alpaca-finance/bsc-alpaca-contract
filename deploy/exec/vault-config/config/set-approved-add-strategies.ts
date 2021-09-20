import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";
import { TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";

interface IInput {
  VAULT_SYMBOL: string;
  ADD_STRATEGIES: string[];
  IS_ENABLE: boolean;
}

interface IDerivedInput {
  configAddress: string;
  addStrategies: string[];
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
  const TITLE = "testnet_set_approved_add_strategies";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    {
      VAULT_SYMBOL: "ibWBNB",
      ADD_STRATEGIES: ["0xC8C113e710dF52C3B30A5fAc06a8F7db6d1192B8", "0x6E0F5224Ae9F6fFD0Bf617676EE9Ffd783301893"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      ADD_STRATEGIES: ["0xC8C113e710dF52C3B30A5fAc06a8F7db6d1192B8", "0xB3c1141b835799ea5f03D8c3E1d624b37A4aca6b"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibETH",
      ADD_STRATEGIES: ["0xC8C113e710dF52C3B30A5fAc06a8F7db6d1192B8", "0x47cf4fb23B9D92B0BC96fF98a2689d6faFc461aA"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibALPACA",
      ADD_STRATEGIES: ["0xC8C113e710dF52C3B30A5fAc06a8F7db6d1192B8", "0x7eE92007B6D84f8BE2bD40e57042f82c00a1988c"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      ADD_STRATEGIES: ["0xC8C113e710dF52C3B30A5fAc06a8F7db6d1192B8", "0xcCBA4DD083A0c484CCba57507B9c8c35047ed45d"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBTCB",
      ADD_STRATEGIES: ["0xC8C113e710dF52C3B30A5fAc06a8F7db6d1192B8", "0xd4643856dC5351196C208D991346bA602e0E70c7"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibTUSD",
      ADD_STRATEGIES: ["0xC8C113e710dF52C3B30A5fAc06a8F7db6d1192B8", "0xc7f35c9E084B95a8DAD83B2D4370D40115716375"],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1631787180";

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
      addStrategies: tv.ADD_STRATEGIES,
      isEnable: tv.IS_ENABLE,
    };
  });

  for (const i of inputs) {
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `>> Queue tx on Timelock to setApprovedStrategies for ${i.configAddress}`,
        i.configAddress,
        "0",
        "setApprovedAddStrategy(address[],bool)",
        ["address[]", "bool"],
        [i.addStrategies, i.isEnable],
        EXACT_ETA
      )
    );
  }

  FileService.write(TITLE, timelockTransactions);
};

export default func;
func.tags = ["SetApprovedAddStrategies"];
