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
      WHITELIST_WORKERS: ["0x42dA676116DF26EE9bb71595fFe7c18343FB2b64"],
    },
  ];

  const deployer = await getDeployer();
  console.log(deployer);
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
