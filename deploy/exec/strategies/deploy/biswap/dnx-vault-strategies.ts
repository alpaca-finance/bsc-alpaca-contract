import { BiswapDnxStrategyAddTwoSidesOptimal } from "./../../../../../typechain";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../../../../../utils/deployer-helper";
import { validateAddress } from "../../../../../utils/address";
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
      VAULT_SYMBOL: "ibWBNB",
      WHITELIST_WORKERS: ["0x661C9Bb0Da0a7A6E4f6Ec6E49cf760Bc570B12A9"],
    },
    {
      VAULT_SYMBOL: "ibETH",
      WHITELIST_WORKERS: ["0x63D0eF9F8e26ddc8371B64F2Fd326a5eC1637f12", "0xe3bD3d71C87fC21427458ea90c0FceD155A486D9"],
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      WHITELIST_WORKERS: [
        "0x4DD4CAc8FA9B8032A1205b0dd0b81b7a3cA89BE7",
        "0xE5747D8fa3418FD4E0097E526D98daf08Ff40A01",
        "0x7DE458Db800eFF41Daa1e3c67B5fA8689EF2908e",
      ],
    },
  ];

  const deployer = await getDeployer();
  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  for (let i = 0; i < NEW_PARAMS.length; i++) {
    const targetedVaultIdx = config.Vaults.findIndex((v) => v.symbol === NEW_PARAMS[i].VAULT_SYMBOL);
    if (targetedVaultIdx === -1) {
      throw `error: not found vault based on ${NEW_PARAMS[i].VAULT_SYMBOL}`;
    }

    const targetedVault = config.Vaults[targetedVaultIdx];
    if (!validateAddress(targetedVault.address)) {
      throw `error: no address`;
    }

    const stratDnxTwoSidesOptimalDeployer = new UpgradeableContractDeployer<BiswapDnxStrategyAddTwoSidesOptimal>(
      deployer,
      "BiswapDnxStrategyAddTwoSidesOptimal",
      NEW_PARAMS[i].VAULT_SYMBOL
    );
    const { contract: strategyDnxAddTwoSidesOptimal } = await stratDnxTwoSidesOptimalDeployer.deploy([
      config.YieldSources.Biswap!.BiswapRouterV2,
      targetedVault.address,
    ]);

    config = configFileHelper.setVaultTwosideOptimalOnKey(
      targetedVault.name,
      "BiswapDnx",
      strategyDnxAddTwoSidesOptimal.address
    );

    if (NEW_PARAMS[i].WHITELIST_WORKERS.length > 0) {
      console.log(">> Whitelisting Workers");
      const tx = await strategyDnxAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKERS, true);
      console.log("✅ Done at: ", tx.hash);

      for (let j = 0; j < NEW_PARAMS[i].WHITELIST_WORKERS.length; j++) {
        const targetWorkerIdx = targetedVault.workers.findIndex(
          (w) => w.address === NEW_PARAMS[i].WHITELIST_WORKERS[j]
        );
        if (targetWorkerIdx === -1) {
          throw `error: not found worker based on ${NEW_PARAMS[i].WHITELIST_WORKERS[j]}`;
        }
        const targetedWorker = targetedVault.workers[targetWorkerIdx];
        targetedWorker.strategies.StrategyAddTwoSidesOptimal = strategyDnxAddTwoSidesOptimal.address;
        configFileHelper.addOrSetVaultWorker(targetedVault.name, targetedWorker);
      }
    }
  }
};

export default func;
func.tags = ["BiswapDnxVaultStrategies"];
