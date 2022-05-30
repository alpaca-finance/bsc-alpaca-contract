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
  const TITLE = "upgrade_delta_neutral_vault_gateway";
  const INPUTS: Array<InputInterface> = [
    {
      VAULT_SYMBOL: "L3x-BUSDBTCB-PCS2",
      WHITELISTED_CALLERS: ["0xEA724deA000b5e5206d28f4BC2dAD5f2FA1fe788"],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1652511600";

  const config = getConfig();

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
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
