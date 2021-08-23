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
  const TITLE = "set_approved_add_strategies";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    {
      VAULT_SYMBOL: "ibWBNB",
      ADD_STRATEGIES: [
        "0x2943b6fC64bDF5bD26E9DFeB9b35d1DBcbdE936C",
        "0x4519d5038B86752edaCef84F779364F1C1C7ed40",
        "0xD15DBC544ad55d4877cAd426a6e6e16446a012b5",
        "0x0A5515aEdc275b9fF19d11Cd74465e83067f6D40",
        "0x821154e5F621F534060E56871bC614Aa43528356",
        "0xC01390eea9A7e27199e03dA5053C2dd63A5169ff",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      ADD_STRATEGIES: [
        "0x2943b6fC64bDF5bD26E9DFeB9b35d1DBcbdE936C",
        "0x4519d5038B86752edaCef84F779364F1C1C7ed40",
        "0xD15DBC544ad55d4877cAd426a6e6e16446a012b5",
        "0x22fC6110d5d9b122f3C2d4715C24566342161a12",
        "0x030652c0C544c0c195584Cb60AE1e331A1D3E9C8",
        "0xFfA12222e3ccEF58684Af20aaa4D5bf13c8faC10",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibETH",
      ADD_STRATEGIES: [
        "0x2943b6fC64bDF5bD26E9DFeB9b35d1DBcbdE936C",
        "0x4519d5038B86752edaCef84F779364F1C1C7ed40",
        "0xD15DBC544ad55d4877cAd426a6e6e16446a012b5",
        "0xD8916928Cd542016E319Ad0c816EF01310462BEa",
        "0xf327b3Af3b1691f52F434D71289f1Ae628aab5e8",
        "0xeBfda6D0232335a067aE6a3e5E470D8cDcb22f53",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibALPACA",
      ADD_STRATEGIES: [
        "0x2943b6fC64bDF5bD26E9DFeB9b35d1DBcbdE936C",
        "0x4519d5038B86752edaCef84F779364F1C1C7ed40",
        "0xD15DBC544ad55d4877cAd426a6e6e16446a012b5",
        "0xdA6031c074d41A28dF8827B3cF6B66352eA3Ba7A",
        "0xa8abDAF399721383A397Fd543687E2983173f54a",
        "0xbc61195af997e06EfbF4a0991b58c890E33e0642",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      ADD_STRATEGIES: [
        "0x2943b6fC64bDF5bD26E9DFeB9b35d1DBcbdE936C",
        "0x4519d5038B86752edaCef84F779364F1C1C7ed40",
        "0xD15DBC544ad55d4877cAd426a6e6e16446a012b5",
        "0x4D71d66e598e6dCaAb9a3a96890f60169d968212",
        "0x44aC65498E51948C79cCF0842Ab505949BC7085B",
        "0x48393b82Abac4Fbb807A927E60008eFaf5f79Cf7",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBTCB",
      ADD_STRATEGIES: [
        "0x2943b6fC64bDF5bD26E9DFeB9b35d1DBcbdE936C",
        "0x4519d5038B86752edaCef84F779364F1C1C7ed40",
        "0xD15DBC544ad55d4877cAd426a6e6e16446a012b5",
        "0x453a9A2500947d2F730068E77C5294D3feb5DA67",
        "0xF3Cad8B2215DCC7067F2655F78A50f86e2dF724D",
        "0x29a8B6f3c9F79314a82f3092EA065F9f15371dB8",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibTUSD",
      ADD_STRATEGIES: [
        "0x2943b6fC64bDF5bD26E9DFeB9b35d1DBcbdE936C",
        "0x4519d5038B86752edaCef84F779364F1C1C7ed40",
        "0xD15DBC544ad55d4877cAd426a6e6e16446a012b5",
        "0xDB399666fc696f9FF7114609fBd891a71944FA05",
        "0x7aDaE260f5135Ef1050Fee880d8A8d02C410dFA7",
        "0x20449871E328BEf6eCCBC39458EeF42c340b195f",
      ],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1628515080";

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
