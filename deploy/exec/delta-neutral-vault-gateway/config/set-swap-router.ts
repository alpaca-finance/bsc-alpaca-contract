import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getDeployer } from "../../../../utils/deployer-helper";
import {
  DeltaNeutralVaultConfig,
  DeltaNeutralVaultConfig__factory,
  DeltaNeutralVaultGateway,
  DeltaNeutralVaultGateway__factory,
} from "../../../../typechain";
import { compare } from "../../../../utils/address";

interface InputInterface {
  VAULT_SYMBOL: string;
  ROUTER: string;
}

interface DerivedInputInterface {
  vaultSymbol: string;
  deltaVaultGateway: DeltaNeutralVaultGateway;
  router: string;
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
      VAULT_SYMBOL: "n3x-BNBUSDT-PCS1",
      ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    },
    {
      VAULT_SYMBOL: "n8x-BNBUSDT-PCS1",
      ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    },
    {
      VAULT_SYMBOL: "n8x-BNBUSDT-PCS2",
      ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    },
    {
      VAULT_SYMBOL: "n3x-BNBBUSD-PCS1",
      ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    },
    {
      VAULT_SYMBOL: "n3x-BNBUSDT-PCS2",
      ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    },
    {
      VAULT_SYMBOL: "n3x-BNBBUSD-PCS2",
      ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    },
    {
      VAULT_SYMBOL: "n3x-BNBUSDT-PCS3",
      ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    },
    {
      VAULT_SYMBOL: "n3x-ETHUSDT-BSW1",
      ROUTER: "0x3a6d8ca21d1cf76f653a67577fa0d27453350dd8",
    },
    {
      VAULT_SYMBOL: "L3x-USDTETH-BSW1",
      ROUTER: "0x3a6d8ca21d1cf76f653a67577fa0d27453350dd8",
    },
    {
      VAULT_SYMBOL: "L3x-BUSDBTCB-PCS1",
      ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
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
      deltaVaultGateway: DeltaNeutralVaultGateway__factory.connect(vault.gateway, deployer),
      router: input.ROUTER,
    };
  });
  let nonce = await deployer.getTransactionCount();

  for (const derivedInput of derivedInputs) {
    const owner = await derivedInput.deltaVaultGateway.owner();

    if (compare(owner, config.Timelock)) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `Queue timelock for set router to ${derivedInput.router} for ${derivedInput.vaultSymbol}`,
          derivedInput.deltaVaultGateway.address,
          "0",
          "setRouter(address)",
          ["address"],
          [derivedInput.router],
          EXACT_ETA,
          { nonce: nonce++ }
        )
      );
    } else {
      console.log("-------------------------");
      console.log(`> Set router to ${derivedInput.router} for ${derivedInput.vaultSymbol}`);
      await derivedInput.deltaVaultGateway.setRouter(derivedInput.router, {
        nonce: nonce++,
      });
      console.log("> ✅ Done");
    }
  }

  if (timelockTransactions.length > 0) {
    const timestamp = Math.floor(Date.now() / 1000);
    fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
  }
};

export default func;
func.tags = ["DeltaNeutralVaultGatewaySetSwapRouter"];
