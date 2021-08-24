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
  const TITLE = "mainnet_set_approved_add_strategies";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    {
      VAULT_SYMBOL: "ibWBNB",
      ADD_STRATEGIES: [
        "0x4c7a420142ec69c7Df5c6C673D862b9E030743bf",
        "0x5cB454fc86068e710212FBECBC93070b90011F2B",
        "0xeBb8BA21A3703ab30187D3EEC02A3Bc62894970D",
        "0xB9B8766B65636779C3B169B9a18e0A708F91c610",
        "0xB0951EB5eCd9948AAA8Eb76D1061361F592BA029",
        "0xA7559bB0235a1c6003D0E48d2cFa89a6C8748439",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      ADD_STRATEGIES: [
        "0x4c7a420142ec69c7Df5c6C673D862b9E030743bf",
        "0x5cB454fc86068e710212FBECBC93070b90011F2B",
        "0xeBb8BA21A3703ab30187D3EEC02A3Bc62894970D",
        "0x3fC149995021f1d7AEc54D015Dad3c7Abc952bf0",
        "0x38912684b1d20Fe9D725e8B39c39458Fac5A4833",
        "0x61e58dE669d842C2d77288Df629af031b3283c81",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibETH",
      ADD_STRATEGIES: [
        "0x4c7a420142ec69c7Df5c6C673D862b9E030743bf",
        "0x5cB454fc86068e710212FBECBC93070b90011F2B",
        "0xeBb8BA21A3703ab30187D3EEC02A3Bc62894970D",
        "0xCB459b4504d10445760095C59c394EA45715d7a5",
        "0x86547E01b7F1BAc1F4cE80A4964829009D2dE1Cc",
        "0xD58b9626d941cA2d31b55a43045d34A87B32cEd3",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibALPACA",
      ADD_STRATEGIES: [
        "0x4c7a420142ec69c7Df5c6C673D862b9E030743bf",
        "0x5cB454fc86068e710212FBECBC93070b90011F2B",
        "0xeBb8BA21A3703ab30187D3EEC02A3Bc62894970D",
        "0xa964FCd9a434CB4C68bFE25E77D1F2Cd5D9679a8",
        "0x09176545F3c013142b69477D7De2E7F4BAa2bB3a",
        "0x462BC565b5486E76503DaB62D96937842F207AAa",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      ADD_STRATEGIES: [
        "0x4c7a420142ec69c7Df5c6C673D862b9E030743bf",
        "0x5cB454fc86068e710212FBECBC93070b90011F2B",
        "0xeBb8BA21A3703ab30187D3EEC02A3Bc62894970D",
        "0x5f94f61095731b669b30ed1f3f4586BBb51f4001",
        "0x50380Ac8DA73D73719785F0A4433192F4e0E6c90",
        "0xcE37fD1Ff0A6cb4A6A59cd46CCf55D5Dc70ec585",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBTCB",
      ADD_STRATEGIES: [
        "0x4c7a420142ec69c7Df5c6C673D862b9E030743bf",
        "0x5cB454fc86068e710212FBECBC93070b90011F2B",
        "0xeBb8BA21A3703ab30187D3EEC02A3Bc62894970D",
        "0xe862D45abdF7ea38F75dd0c7164B19FaEd057130",
        "0x30A937B9d22d71e58Ad9dC96a6A3d552B9C0724e",
        "0xaC712F4Fc61ab96Aa9A1AdF3977b808789aA6682",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibTUSD",
      ADD_STRATEGIES: [
        "0x4c7a420142ec69c7Df5c6C673D862b9E030743bf",
        "0x5cB454fc86068e710212FBECBC93070b90011F2B",
        "0xeBb8BA21A3703ab30187D3EEC02A3Bc62894970D",
        "0xA8F37daF3D290F636f0B79E47ea50aB7f7A82d51",
        "0x67a2CdB9F0760663B5E70c1517f1a603BA3F50f0",
        "0x8cE75fF793D7832302BeA91c275e2509060DfEaA",
      ],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1629437400";

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
