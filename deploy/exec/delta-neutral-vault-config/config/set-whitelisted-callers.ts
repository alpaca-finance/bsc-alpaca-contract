import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getDeployer } from "../../../../utils/deployer-helper";
import { DeltaNeutralVaultConfig, DeltaNeutralVaultConfig__factory } from "../../../../typechain";
import { compare } from "../../../../utils/address";

interface InputInterface {
  VAULT_SYMBOL: string;
  WHITELISTED_CALLERS: string[];
  IS_ENABLE: boolean;
}

interface DerivedInputInterface {
  vaultSymbol: string;
  deltaVaultConfig: DeltaNeutralVaultConfig;
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
  const config = getConfig();

  const TITLE = "whitelisted_av_migrator";
  const INPUTS: Array<InputInterface> = [
    // vaults to migrate
    {
      VAULT_SYMBOL: "n3x-BNBBUSD-PCS2",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "n3x-BNBUSDT-PCS2",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "n3x-BNBUSDT-PCS3",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "n3x-ETHUSDT-BSW1",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "n8x-BNBUSDT-PCS3",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "n8x-BNBUSDT-BSW1",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "L3x-BUSDBTCB-PCS2",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "L8x-BUSDBTCB-PCS1",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    // vault to deposit
    {
      VAULT_SYMBOL: "n3x-BNBBUSD-PCS1",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "n3x-BNBUSDT-PCS1",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "n8x-BNBUSDT-PCS1",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "L3x-BUSDBTCB-PCS1",
      WHITELISTED_CALLERS: [config.AutomatedVaultExecutor?.migrator!],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1669788000";

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
  const chainId = await deployer.getChainId();
  const derivedInputs: Array<DerivedInputInterface> = INPUTS.map((input) => {
    const vault = config.DeltaNeutralVaults.find((v) => input.VAULT_SYMBOL == v.symbol);
    if (vault === undefined) {
      throw `error: not found vault with ${input.VAULT_SYMBOL} symbol`;
    }
    if (vault.config === "") {
      throw `error: not found config address`;
    }

    return {
      vaultSymbol: input.VAULT_SYMBOL,
      deltaVaultConfig: DeltaNeutralVaultConfig__factory.connect(vault.config, deployer),
      whitelistedCallers: input.WHITELISTED_CALLERS,
      isEnable: input.IS_ENABLE,
    };
  });
  let nonce = await deployer.getTransactionCount();

  for (const derivedInput of derivedInputs) {
    const owner = await derivedInput.deltaVaultConfig.owner();

    if (compare(owner, config.Timelock)) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          chainId,
          `Queue timelock for whitelisting [${derivedInput.whitelistedCallers.join(",")}] for ${
            derivedInput.vaultSymbol
          }`,
          derivedInput.deltaVaultConfig.address,
          "0",
          "setWhitelistedCallers(address[],bool)",
          ["address[]", "bool"],
          [derivedInput.whitelistedCallers, derivedInput.isEnable],
          EXACT_ETA,
          { nonce: nonce++ }
        )
      );
    } else {
      console.log("-------------------------");
      console.log(`> Whitelisting [${derivedInput.whitelistedCallers.join(",")}] for ${derivedInput.vaultSymbol}`);
      await derivedInput.deltaVaultConfig.setWhitelistedCallers(
        derivedInput.whitelistedCallers,
        derivedInput.isEnable,
        { nonce: nonce++ }
      );
      console.log("> ✅ Done");
    }
  }

  if (timelockTransactions.length > 0) {
    const timestamp = Math.floor(Date.now() / 1000);
    fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
  }
};

export default func;
func.tags = ["DeltaNeutralVaultConfigSetWhitelistedCallers"];
