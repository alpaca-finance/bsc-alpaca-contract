import { RepurchaseRepayStrategy } from "../../../../../typechain";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../../../../../utils/deployer-helper";
import { compare, validateAddress } from "../../../../../utils/address";
import { UpgradeableContractDeployer } from "../../../../deployer";
import { ConfigFileHelper } from "../../../../helper";

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
  const NEW_PARAMS = [
    {
      WHITELIST_WORKERS: [
        "0x792E8192F2fbdBb5c1e36F312760Fe01D0d7aB92",
        "0xceCD803b048b66a75bc64f8AA8139cAB97c421C8",
        "0x0e807E2F50dfe8616636083Ba5ecef97280338cf",
        "0xBF94404D6ad9986532d25950585e5855b4c30d2c",
      ],
    },
  ];

  const deployer = await getDeployer();
  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  for (let i = 0; i < NEW_PARAMS.length; i++) {
    const stratDeployer = new UpgradeableContractDeployer<RepurchaseRepayStrategy>(deployer, "RepurchaseRepayStrategy");

    const { contract: strategyRepurchaseRepay } = await stratDeployer.deploy([]);

    config = configFileHelper.setSharedStrategyOnKey("All", "StrategyRepurchaseRepay", strategyRepurchaseRepay.address);

    if (NEW_PARAMS[i].WHITELIST_WORKERS.length > 0) {
      console.log(">> Whitelisting Workers");
      const tx = await strategyRepurchaseRepay.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKERS, true);
      console.log("✅ Done at: ", tx.hash);
    }
  }
};

export default func;
func.tags = ["RepurchaseRepayStrategies"];
