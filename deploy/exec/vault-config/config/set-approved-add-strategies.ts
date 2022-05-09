import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getConfig } from "../../../entities/config";

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
  const TITLE = "mainnet_bsw_set_approved_add_strategies";
  const TARGETED_VAULT_CONFIG: Array<IInput> = [
    {
      VAULT_SYMBOL: "ibWBNB",
      ADD_STRATEGIES: ["0xaAEF721098a4f123353495d75604fA921C7CE323", "0x87d0BEaF4124a72F99ECDF350a8aD4Ed732A9C48"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      ADD_STRATEGIES: ["0xaAEF721098a4f123353495d75604fA921C7CE323", "0x36b1FB077bD0185a64FF0b5E9249F700cA7C5290"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibETH",
      ADD_STRATEGIES: ["0xaAEF721098a4f123353495d75604fA921C7CE323", "0x8D9fEC1B16708F0Fa64877b54ac82e2c50Db3E73"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibALPACA",
      ADD_STRATEGIES: ["0xaAEF721098a4f123353495d75604fA921C7CE323", "0x082eb6de59CC80107ed2c15C7c08c79F2B6b9720"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      ADD_STRATEGIES: ["0xaAEF721098a4f123353495d75604fA921C7CE323", "0xf4B38789212E997C1603E08C4Ec27A962A626E36"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibBTCB",
      ADD_STRATEGIES: ["0xaAEF721098a4f123353495d75604fA921C7CE323", "0x8cAFA07aa8cFd60DD3D45Dbc544EeaB958305F0e"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibTUSD",
      ADD_STRATEGIES: ["0xaAEF721098a4f123353495d75604fA921C7CE323", "0x559B79aDaBe0da4BE806B788eb5e63fD95FaaD0a"],
      IS_ENABLE: true,
    },
    {
      VAULT_SYMBOL: "ibUSDC",
      ADD_STRATEGIES: ["0xaAEF721098a4f123353495d75604fA921C7CE323", "0xf7e7c056B7F47a51264374d68C02F77d5c8dC32b"],
      IS_ENABLE: true,
    },
  ];
  const EXACT_ETA = "1651057200";

  const config = getConfig();
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
        EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("15", "gwei") }
      )
    );
  }

  const ts = Math.floor(new Date().getTime() / 1000);
  fileService.writeJson(`${ts}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["SetApprovedAddStrategies"];
