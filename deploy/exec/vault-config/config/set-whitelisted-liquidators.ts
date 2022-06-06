import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { network, ethers } from "hardhat";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { ConfigurableInterestVaultConfig__factory } from "../../../../typechain";
import { compare } from "../../../../utils/address";
import { getConfig } from "../../../entities/config";
import { getDeployer } from "../../../../utils/deployer-helper";

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
  const TITLE = "roberto";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    {
      VAULT_SYMBOL: "ibCAKE",
      WHITELISTED_LIQUIDATORS: [
        "0x0002e89a801bf95a131fbbbdfd3097fa84809d7c",
        "0x000364c0648cf162d3b70c35e1b258dfaa560ae6",
        "0x0004d0b6a17082aa8f4fbec781d3c330da831808",
        "0x0a8bd76bccb0861e15aaa69b77ed7611431905c8",
        "0x103943818b4f972c36e187de07b68d28e699e4c7",
        "0x179f1c3ea53fcd96730aa76d5f28305f8a2a0880",
        "0x18b6d83c99c181f2abb663f475792f7e3be10a23",
        "0x1ba3b507dd19449cd81378c57b3b94d9240a8eb6",
        "0x1c06c528f5de8d2b9fb956b194ec634db5eff799",
        "0x22a15431f00e24cc083d7c7d448d133d9cce23b3",
        "0x2a31e333a5ea328322d1c356ee9bee84635b3f4c",
        "0x2a671f07744356cbe2df9e0b2f36777c27a0e9c1",
        "0x3956ce5c72154cf880be0c9d686260045483278e",
        "0x39ab396f78678a0133bc5c41ee692a3f707f0d52",
        "0x3a319b7efc85d09e5f4a07c8a127363c127e1fd2",
        "0x3de172ba52a8e3b2287e3faf1e6c54b8d7dc7c71",
        "0x3fe851af472ceea55c8abef9aa31865442299ba4",
        "0x424c64a301d8de84d1c8260100291cd1a22e9d51",
        "0x4bd1634e520c986b5b03c2f1dcf367830e7b0930",
        "0x560348fed52d9e9c621d2b1fdfcda3ea0dc2b1c8",
        "0x5bff64351e582263fbc63db75e524f7ddbfafdb8",
        "0x5c8eb3e232161bbb6609ee30ee169e1e4a2a619f",
        "0x5feab3dc3b37a00a3739f9fd96a4d9c7e62ddc1e",
        "0x622327e26bd529c6627232125617c527e5ccea9f",
        "0x6f22c1354c1e1e60940fdd289f556d58831ad737",
        "0x7b4ef93efd88c3efd385e1af738e14526a6febab",
        "0x7d77a3db2c64b6acb6967beae0d6a8aec483823a",
        "0x7eff7320ab0e51ac9338e21e3290b1bd7fe82b73",
        "0x7fcafd1db06ee229054dba4a368485d965824bf9",
        "0x999ef29c6d9c9d29f601a841d766e0c0e0ef0a3c",
        "0x9b75e85daa209d25ebf205eab89bf0b86f9f2d3e",
        "0x9d71b3f61979c3efa78da5324c19db557692b53a",
        "0x9f6ee745d63529d61c853892be61459f65762ee1",
        "0xaabc5dfb1457d4a2e45127e9c032b6e8e0d3a05f",
        "0xb1d9836dd79ad9d3edc96c6e3b90ef82cd808d3a",
        "0xb3842d2bf90cbf6f24b1eea36301cef43b61f864",
        "0xbd96d563126f7313ffd159b4b9e1893b69c515db",
        "0xbdb452e087f918d453ca21b2a61a1e210daabfcf",
        "0xd009293c007f13e41d479c4bcf5ad2fa8d0f4401",
        "0xd1bfc13736873939d7c69332537b8896332d862c",
        "0xe206d79d7f3dbb971ea1498806059ea6b2bc74ef",
        "0xe29299672f0fbb0d038abd9921d4dd83f8a100d8",
        "0xe5f31f42f0487f38d92692e37c37cb338f214f28",
        "0xed06d074800d3005b7f96704c16c8a36b580185d",
        "0xf137e2d0c3c91045990aebef06d6015800475152",
        "0xf3ddf40874a7e29d31870eaa2371e48fd3b544ee",
        "0xfc2f0be83571244ba07d11861ecca443f446a47a",
        "0xfddec8cab752709345f85b0b64429a02c75a62ff",
        "0xfef9d28767de30f4239b9b40bc915919b0bcace8",
        "0xff5e59c1f57afd16d75409a3b293c5caf09d070c",
      ],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1638935400";

  const config = getConfig();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
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
      whitelistedLiquidators: tv.WHITELISTED_LIQUIDATORS,
      isEnable: tv.IS_ENABLE,
    };
  });

  for (const i of inputs) {
    const vaultConfig = ConfigurableInterestVaultConfig__factory.connect(i.configAddress, deployer);
    const owner = await vaultConfig.owner();

    if (compare(owner, config.Timelock)) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `> Queue tx on Timelock to setWhitelistedLiquidators for ${i.configAddress}`,
          i.configAddress,
          "0",
          "setWhitelistedLiquidators(address[],bool)",
          ["address[]", "bool"],
          [i.whitelistedLiquidators, i.isEnable],
          EXACT_ETA,
          { gasPrice: ethers.utils.parseUnits("20", "gwei"), nonce: nonce++ }
        )
      );
    } else {
      console.log("> Set whitelistedLiquidators for", i.configAddress);
      const tx = await vaultConfig.setWhitelistedLiquidators(i.whitelistedLiquidators, i.isEnable);
      console.log(`> ⛓ Tx hash: ${tx.hash}`);
    }
  }

  if (timelockTransactions.length > 0) {
    const timestamp = Math.floor(Date.now() / 1000);
    fileService.writeJson(TITLE, `${timestamp}_${timelockTransactions}`);
  }
};

export default func;
func.tags = ["SetWhitelistedLiquidators"];
