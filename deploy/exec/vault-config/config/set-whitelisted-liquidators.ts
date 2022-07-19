import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
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
  const TITLE = "wei";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    // {
    //   VAULT_SYMBOL: "ibWBNB",
    //   WHITELISTED_LIQUIDATORS: ["0x2e3419E9fdF65C7089DACA30184345B343Abff30"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibBUSD",
    //   WHITELISTED_LIQUIDATORS: ["0x2e3419E9fdF65C7089DACA30184345B343Abff30"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibETH",
    //   WHITELISTED_LIQUIDATORS: ["0x2e3419E9fdF65C7089DACA30184345B343Abff30"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibALPACA",
    //   WHITELISTED_LIQUIDATORS: ["0x2e3419E9fdF65C7089DACA30184345B343Abff30"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibUSDT",
    //   WHITELISTED_LIQUIDATORS: ["0x2e3419E9fdF65C7089DACA30184345B343Abff30"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibBTCB",
    //   WHITELISTED_LIQUIDATORS: ["0x2e3419E9fdF65C7089DACA30184345B343Abff30"],
    //   IS_ENABLE: true,
    // },
    // {
    //   VAULT_SYMBOL: "ibTUSD",
    //   WHITELISTED_LIQUIDATORS: ["0x2e3419E9fdF65C7089DACA30184345B343Abff30"],
    //   IS_ENABLE: true,
    // },
    {
      VAULT_SYMBOL: "ibUSDC",
      WHITELISTED_LIQUIDATORS: [
        "0x3De172bA52A8E3B2287E3FAf1E6c54B8d7Dc7C71",
        "0x103943818B4F972C36e187De07b68D28E699E4c7",
      ],
      IS_ENABLE: true,
    },
    // {
    //   VAULT_SYMBOL: "ibCAKE",
    //   WHITELISTED_LIQUIDATORS: ["0x2e3419E9fdF65C7089DACA30184345B343Abff30"],
    //   IS_ENABLE: true,
    // },
  ];
  const EXACT_ETA = "1657009800";

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
      console.log("-----------");
      console.log("> Set whitelistedLiquidators for", i.configAddress);
      const tx = await vaultConfig.setWhitelistedLiquidators(i.whitelistedLiquidators, i.isEnable);
      console.log(`> ⛓ Tx hash: ${tx.hash}`);
    }
  }

  if (timelockTransactions.length > 0) {
    const timestamp = Math.floor(Date.now() / 1000);
    fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
  }
};

export default func;
func.tags = ["SetWhitelistedLiquidators"];
