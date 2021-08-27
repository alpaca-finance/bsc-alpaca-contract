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
  const TITLE = "testnet_set_whitelisted_liquidators";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    {
      VAULT_SYMBOL: "ibWBNB",
      WHITELISTED_LIQUIDATORS: [
        "0xaaBc5DfB1457D4a2E45127E9C032b6e8e0D3A05F",
        "0x7fcafD1dB06EE229054DBa4A368485D965824bF9",
        "0x3A319b7efC85D09e5f4a07C8A127363c127E1FD2",
        "0x2A671F07744356Cbe2Df9E0b2f36777c27A0E9c1",
        "0x5feab3Dc3b37A00a3739F9fd96A4d9c7E62Ddc1e",
        "0xf3DdF40874a7e29D31870EAa2371E48Fd3B544eE",
        "0x7D77A3Db2c64b6ACB6967BEAe0d6A8AEc483823a",
        "0x999Ef29C6d9c9d29F601a841D766E0C0E0ef0a3c",
        "0x0A8BD76BccB0861E15aaa69B77ed7611431905c8",
        "0x3fe851Af472CeEa55c8AbEF9AA31865442299BA4",
        "0x7eff7320AB0e51ac9338e21E3290B1bd7FE82B73",
        "0xfC2F0bE83571244Ba07d11861eCcA443F446A47A",
        "0xBdB452e087F918d453ca21B2A61A1e210daABfcf",
        "0x5c8eB3e232161bBb6609Ee30eE169E1e4a2A619f",
        "0xd009293C007F13E41D479c4BcF5aD2fA8d0f4401",
        "0xe206d79D7F3Dbb971ea1498806059eA6b2bC74eF",
        "0x2A31e333A5ea328322D1c356eE9BEe84635B3F4c",
        "0xe5F31f42f0487f38d92692e37c37cb338F214f28",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      WHITELISTED_LIQUIDATORS: [
        "0xaaBc5DfB1457D4a2E45127E9C032b6e8e0D3A05F",
        "0x7fcafD1dB06EE229054DBa4A368485D965824bF9",
        "0x3A319b7efC85D09e5f4a07C8A127363c127E1FD2",
        "0x2A671F07744356Cbe2Df9E0b2f36777c27A0E9c1",
        "0x5feab3Dc3b37A00a3739F9fd96A4d9c7E62Ddc1e",
        "0xf3DdF40874a7e29D31870EAa2371E48Fd3B544eE",
        "0x7D77A3Db2c64b6ACB6967BEAe0d6A8AEc483823a",
        "0x999Ef29C6d9c9d29F601a841D766E0C0E0ef0a3c",
        "0x0A8BD76BccB0861E15aaa69B77ed7611431905c8",
        "0x3fe851Af472CeEa55c8AbEF9AA31865442299BA4",
        "0x7eff7320AB0e51ac9338e21E3290B1bd7FE82B73",
        "0xfC2F0bE83571244Ba07d11861eCcA443F446A47A",
        "0xBdB452e087F918d453ca21B2A61A1e210daABfcf",
        "0x5c8eB3e232161bBb6609Ee30eE169E1e4a2A619f",
        "0xd009293C007F13E41D479c4BcF5aD2fA8d0f4401",
        "0xe206d79D7F3Dbb971ea1498806059eA6b2bC74eF",
        "0x2A31e333A5ea328322D1c356eE9BEe84635B3F4c",
        "0xe5F31f42f0487f38d92692e37c37cb338F214f28",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibETH",
      WHITELISTED_LIQUIDATORS: [
        "0xaaBc5DfB1457D4a2E45127E9C032b6e8e0D3A05F",
        "0x7fcafD1dB06EE229054DBa4A368485D965824bF9",
        "0x3A319b7efC85D09e5f4a07C8A127363c127E1FD2",
        "0x2A671F07744356Cbe2Df9E0b2f36777c27A0E9c1",
        "0x5feab3Dc3b37A00a3739F9fd96A4d9c7E62Ddc1e",
        "0xf3DdF40874a7e29D31870EAa2371E48Fd3B544eE",
        "0x7D77A3Db2c64b6ACB6967BEAe0d6A8AEc483823a",
        "0x999Ef29C6d9c9d29F601a841D766E0C0E0ef0a3c",
        "0x0A8BD76BccB0861E15aaa69B77ed7611431905c8",
        "0x3fe851Af472CeEa55c8AbEF9AA31865442299BA4",
        "0x7eff7320AB0e51ac9338e21E3290B1bd7FE82B73",
        "0xfC2F0bE83571244Ba07d11861eCcA443F446A47A",
        "0xBdB452e087F918d453ca21B2A61A1e210daABfcf",
        "0x5c8eB3e232161bBb6609Ee30eE169E1e4a2A619f",
        "0xd009293C007F13E41D479c4BcF5aD2fA8d0f4401",
        "0xe206d79D7F3Dbb971ea1498806059eA6b2bC74eF",
        "0x2A31e333A5ea328322D1c356eE9BEe84635B3F4c",
        "0xe5F31f42f0487f38d92692e37c37cb338F214f28",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibALPACA",
      WHITELISTED_LIQUIDATORS: [
        "0xaaBc5DfB1457D4a2E45127E9C032b6e8e0D3A05F",
        "0x7fcafD1dB06EE229054DBa4A368485D965824bF9",
        "0x3A319b7efC85D09e5f4a07C8A127363c127E1FD2",
        "0x2A671F07744356Cbe2Df9E0b2f36777c27A0E9c1",
        "0x5feab3Dc3b37A00a3739F9fd96A4d9c7E62Ddc1e",
        "0xf3DdF40874a7e29D31870EAa2371E48Fd3B544eE",
        "0x7D77A3Db2c64b6ACB6967BEAe0d6A8AEc483823a",
        "0x999Ef29C6d9c9d29F601a841D766E0C0E0ef0a3c",
        "0x0A8BD76BccB0861E15aaa69B77ed7611431905c8",
        "0x3fe851Af472CeEa55c8AbEF9AA31865442299BA4",
        "0x7eff7320AB0e51ac9338e21E3290B1bd7FE82B73",
        "0xfC2F0bE83571244Ba07d11861eCcA443F446A47A",
        "0xBdB452e087F918d453ca21B2A61A1e210daABfcf",
        "0x5c8eB3e232161bBb6609Ee30eE169E1e4a2A619f",
        "0xd009293C007F13E41D479c4BcF5aD2fA8d0f4401",
        "0xe206d79D7F3Dbb971ea1498806059eA6b2bC74eF",
        "0x2A31e333A5ea328322D1c356eE9BEe84635B3F4c",
        "0xe5F31f42f0487f38d92692e37c37cb338F214f28",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      WHITELISTED_LIQUIDATORS: [
        "0xaaBc5DfB1457D4a2E45127E9C032b6e8e0D3A05F",
        "0x7fcafD1dB06EE229054DBa4A368485D965824bF9",
        "0x3A319b7efC85D09e5f4a07C8A127363c127E1FD2",
        "0x2A671F07744356Cbe2Df9E0b2f36777c27A0E9c1",
        "0x5feab3Dc3b37A00a3739F9fd96A4d9c7E62Ddc1e",
        "0xf3DdF40874a7e29D31870EAa2371E48Fd3B544eE",
        "0x7D77A3Db2c64b6ACB6967BEAe0d6A8AEc483823a",
        "0x999Ef29C6d9c9d29F601a841D766E0C0E0ef0a3c",
        "0x0A8BD76BccB0861E15aaa69B77ed7611431905c8",
        "0x3fe851Af472CeEa55c8AbEF9AA31865442299BA4",
        "0x7eff7320AB0e51ac9338e21E3290B1bd7FE82B73",
        "0xfC2F0bE83571244Ba07d11861eCcA443F446A47A",
        "0xBdB452e087F918d453ca21B2A61A1e210daABfcf",
        "0x5c8eB3e232161bBb6609Ee30eE169E1e4a2A619f",
        "0xd009293C007F13E41D479c4BcF5aD2fA8d0f4401",
        "0xe206d79D7F3Dbb971ea1498806059eA6b2bC74eF",
        "0x2A31e333A5ea328322D1c356eE9BEe84635B3F4c",
        "0xe5F31f42f0487f38d92692e37c37cb338F214f28",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBTCB",
      WHITELISTED_LIQUIDATORS: [
        "0xaaBc5DfB1457D4a2E45127E9C032b6e8e0D3A05F",
        "0x7fcafD1dB06EE229054DBa4A368485D965824bF9",
        "0x3A319b7efC85D09e5f4a07C8A127363c127E1FD2",
        "0x2A671F07744356Cbe2Df9E0b2f36777c27A0E9c1",
        "0x5feab3Dc3b37A00a3739F9fd96A4d9c7E62Ddc1e",
        "0xf3DdF40874a7e29D31870EAa2371E48Fd3B544eE",
        "0x7D77A3Db2c64b6ACB6967BEAe0d6A8AEc483823a",
        "0x999Ef29C6d9c9d29F601a841D766E0C0E0ef0a3c",
        "0x0A8BD76BccB0861E15aaa69B77ed7611431905c8",
        "0x3fe851Af472CeEa55c8AbEF9AA31865442299BA4",
        "0x7eff7320AB0e51ac9338e21E3290B1bd7FE82B73",
        "0xfC2F0bE83571244Ba07d11861eCcA443F446A47A",
        "0xBdB452e087F918d453ca21B2A61A1e210daABfcf",
        "0x5c8eB3e232161bBb6609Ee30eE169E1e4a2A619f",
        "0xd009293C007F13E41D479c4BcF5aD2fA8d0f4401",
        "0xe206d79D7F3Dbb971ea1498806059eA6b2bC74eF",
        "0x2A31e333A5ea328322D1c356eE9BEe84635B3F4c",
        "0xe5F31f42f0487f38d92692e37c37cb338F214f28",
      ],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibTUSD",
      WHITELISTED_LIQUIDATORS: [
        "0xaaBc5DfB1457D4a2E45127E9C032b6e8e0D3A05F",
        "0x7fcafD1dB06EE229054DBa4A368485D965824bF9",
        "0x3A319b7efC85D09e5f4a07C8A127363c127E1FD2",
        "0x2A671F07744356Cbe2Df9E0b2f36777c27A0E9c1",
        "0x5feab3Dc3b37A00a3739F9fd96A4d9c7E62Ddc1e",
        "0xf3DdF40874a7e29D31870EAa2371E48Fd3B544eE",
        "0x7D77A3Db2c64b6ACB6967BEAe0d6A8AEc483823a",
        "0x999Ef29C6d9c9d29F601a841D766E0C0E0ef0a3c",
        "0x0A8BD76BccB0861E15aaa69B77ed7611431905c8",
        "0x3fe851Af472CeEa55c8AbEF9AA31865442299BA4",
        "0x7eff7320AB0e51ac9338e21E3290B1bd7FE82B73",
        "0xfC2F0bE83571244Ba07d11861eCcA443F446A47A",
        "0xBdB452e087F918d453ca21B2A61A1e210daABfcf",
        "0x5c8eB3e232161bBb6609Ee30eE169E1e4a2A619f",
        "0xd009293C007F13E41D479c4BcF5aD2fA8d0f4401",
        "0xe206d79D7F3Dbb971ea1498806059eA6b2bC74eF",
        "0x2A31e333A5ea328322D1c356eE9BEe84635B3F4c",
        "0xe5F31f42f0487f38d92692e37c37cb338F214f28",
      ],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1630122300";

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
