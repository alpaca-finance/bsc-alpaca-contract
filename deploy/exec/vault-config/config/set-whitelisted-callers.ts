import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";
import { getConfig } from "../../../entities/config";
import { Multicall2Service } from "../../../services/multicall/multicall2";
import { ConfigurableInterestVaultConfig, ConfigurableInterestVaultConfig__factory } from "../../../../typechain";

interface IInput {
  VAULT_SYMBOL: string;
  WHITELISTED_CALLERS: string[];
  IS_ENABLE: boolean;
}

interface IDerivedInput {
  vaultConfig: ConfigurableInterestVaultConfig;
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
  const TITLE = "mainnet_8x_pcs2_delta_neutral_set_whitelisted_callers";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    {
      VAULT_SYMBOL: "ibWBNB",
      WHITELISTED_CALLERS: ["0xC57876a95A4f31a0A4FDB0329Fc78e00B092cC94"],
      IS_ENABLE: true,
    },
    // {
    //   VAULT_SYMBOL: "ibBUSD",
    //   WHITELISTED_CALLERS: ["0xEA724deA000b5e5206d28f4BC2dAD5f2FA1fe788"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibETH",
    //   WHITELISTED_CALLERS: ["0xEA724deA000b5e5206d28f4BC2dAD5f2FA1fe788"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibALPACA",
    //   WHITELISTED_CALLERS: ["0xEA724deA000b5e5206d28f4BC2dAD5f2FA1fe788"],
    //   IS_ENABLE: true,
    // },
    {
      VAULT_SYMBOL: "ibUSDT",
      WHITELISTED_CALLERS: ["0xC57876a95A4f31a0A4FDB0329Fc78e00B092cC94"],
      IS_ENABLE: true,
    },
    // {
    //   VAULT_SYMBOL: "ibBTCB",
    //   WHITELISTED_CALLERS: ["0xEA724deA000b5e5206d28f4BC2dAD5f2FA1fe788"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibTUSD",
    //   WHITELISTED_CALLERS: ["0xEA724deA000b5e5206d28f4BC2dAD5f2FA1fe788"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibFTM",
    //   WHITELISTED_CALLERS: ["0x06fB33A279B363D8c15245398DF708194699D816"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibUSDC",
    //   WHITELISTED_CALLERS: ["0x06fB33A279B363D8c15245398DF708194699D816"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibTOMB",
    //   WHITELISTED_CALLERS: ["0x06fB33A279B363D8c15245398DF708194699D816"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibALPACA",
    //   WHITELISTED_CALLERS: ["0x06fB33A279B363D8c15245398DF708194699D816"],
    //   IS_ENABLE: true,
    // },
  ];
  const EXACT_ETA = "1648206100";

  const config = getConfig();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const [deployer] = await ethers.getSigners();
  const multiCall2Service = new Multicall2Service(config.MultiCall, deployer);
  let nonce = await deployer.getTransactionCount();

  const inputs: Array<IDerivedInput> = TARGETED_VAULT_CONFIG.map((tv) => {
    const vault = config.Vaults.find((v) => tv.VAULT_SYMBOL == v.symbol);
    if (vault === undefined) {
      throw `error: not found vault with ${tv.VAULT_SYMBOL} symbol`;
    }
    if (vault.config === "") {
      throw `error: not found config address`;
    }

    return {
      vaultConfig: ConfigurableInterestVaultConfig__factory.connect(vault.config, deployer),
      whitelistedCallers: tv.WHITELISTED_CALLERS,
      isEnable: tv.IS_ENABLE,
    };
  });

  const owners = await multiCall2Service.multiContractCall<Array<string>>(
    inputs.map((i) => {
      return {
        contract: i.vaultConfig,
        functionName: "owner",
      };
    })
  );

  for (let index = 0; index < inputs.length; index++) {
    const i = inputs[index];
    const owner = owners[index];

    if (owner.toLowerCase() === config.Timelock.toLowerCase()) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `>> Queue tx on Timelock to setWhitelistedCallers for ${i.vaultConfig.address}`,
          i.vaultConfig.address,
          "0",
          "setWhitelistedCallers(address[],bool)",
          ["address[]", "bool"],
          [i.whitelistedCallers, i.isEnable],
          EXACT_ETA,
          { gasPrice: ethers.utils.parseUnits("15", "gwei"), nonce: nonce++ }
        )
      );
      continue;
    } else {
      console.log(`>> setWhitelistedCaller for ${i.vaultConfig.address}`);
      await i.vaultConfig.setWhitelistedCallers(i.whitelistedCallers, i.isEnable, { nonce: nonce++ });
      console.log(`>> ✅ Done`);
    }
  }

  FileService.write(TITLE, timelockTransactions);
};

export default func;
func.tags = ["SetWhitelistedCallers"];
