import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";
import { getConfig } from "../../../entities/config";
import { Multicall2Service } from "../../../services/multicall/multicall2";
import { ConfigurableInterestVaultConfig, ConfigurableInterestVaultConfig__factory } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";

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
  const TITLE = "fantom_mainnet_3x_delta_neutral_set_whitelisted_callers";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    // {
    //   VAULT_SYMBOL: "ibWBNB",
    //   WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibBUSD",
    //   WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibETH",
    //   WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibALPACA",
    //   WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibUSDT",
    //   WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibBTCB",
    //   WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibTUSD",
    //   WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
    //   IS_ENABLE: true,
    // },
    {
      VAULT_SYMBOL: "ibFTM",
      WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibUSDC",
      WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
      IS_ENABLE: true,
    },
    // {
    //   VAULT_SYMBOL: "ibTOMB",
    //   WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibALPACA",
    //   WHITELISTED_CALLERS: ["0x158B8236529B0f2cf670891AD32a4bBa27090C2f"],
    //   IS_ENABLE: true,
    // },
  ];
  const EXACT_ETA = "1648291200";

  const config = getConfig();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
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
  let isTimeLockExecuted: boolean = false;
  for (let index = 0; index < inputs.length; index++) {
    const i = inputs[index];
    const owner = owners[index];

    if (owner.toLowerCase() === config.Timelock.toLowerCase()) {
      isTimeLockExecuted = true;
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

  isTimeLockExecuted && FileService.write(TITLE, timelockTransactions);
};

export default func;
func.tags = ["SetWhitelistedCallers"];
