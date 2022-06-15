import { PancakeswapV2RestrictedDnxStrategyAddTwoSidesOptimal } from "./../../../../../typechain";
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
      WHITELIST_WORKERS: [
        "0x42dA676116DF26EE9bb71595fFe7c18343FB2b64",
        "0x83A5d5c54Ad83bBeA8667B3B95d7610E16e52723",
        "0xFa4B1e50f6EF51D0DaB5c2EEA7434cE6974Fa832",
        "0x07767daF4e84bDAaBf3A72c80cec8C8Eb962f3Ae",
        "0xae2b281719f2D27C1478a53995Afed82Ccd8B051",
        "0xb4FF3828d9d8eE0997cc29fF173A1C621D797bD7",
        "0x79A499228e3A2ae0168f3fbD2019EeF991A43B41",
        "0xBbFACE35322D6d04E0Cf911626Fa54B55ADf8fB8",
        "0xE0e4e9F91d26647265Be902d012C6fDc0f4fd4e5",
        "0xd60f6bb9e2a1e6C44Bd1Df3946d76cBd79C9636F",
      ],
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      WHITELIST_WORKERS: [
        "0x54D3218787060463EEb944fa01b0cbE745Ef4DB5",
        "0x59984D70342dB0A4797D6C6E256d9445efeeb949",
        "0x100aBb8EF81470F5A83A078c76B1cA74d33e4b92",
        "0x071ac07A287C643b193bc107D29DF4D53BFFAFf7",
        "0xdAa4D6FfF2055Fa2A3936190EA4FcC682Dc46898",
        "0x287705baa115e927998eE8D1941397C9977ebd89",
      ],
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      WHITELIST_WORKERS: [
        "0x8EF56e94bbaEe1638C3c87D3ab0de0a90e2cB067",
        "0x4b70c41F514FBBEa718234Ac72f36c1b077a4162",
        "0x0d9fAF7023976B45b220b692699C5f5E9432EFD9",
        "0xCB0531f17ff9f4FF3FbEdA38A63250706BE2B853",
        "0x9638A202B9Ae27650e7c40153590D666F67fFceF",
        "0xf58f039B76F4094cA324eEA291bE56838789BB56",
        "0x4acFecBbe2965119DB6c9d539e4aF4A1DA9bD43B",
      ],
    },
    {
      VAULT_SYMBOL: "ibBTCB",
      WHITELIST_WORKERS: [
        "0x93269F1600C19FeD0a378b242B698f647E48A6ed",
        "0x3F89B3198cB710248136bbB640e88C1618436d20",
        "0x63AA720547385e9a3f4E240A13C3007F94664f72",
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

    const stratDnxTwoSidesOptimalDeployer =
      new UpgradeableContractDeployer<PancakeswapV2RestrictedDnxStrategyAddTwoSidesOptimal>(
        deployer,
        "PancakeswapV2RestrictedDnxStrategyAddTwoSidesOptimal",
        NEW_PARAMS[i].VAULT_SYMBOL
      );
    const { contract: strategyDnxAddTwoSidesOptimal } = await stratDnxTwoSidesOptimalDeployer.deploy([
      config.YieldSources.PancakeswapMasterChefV2!.RouterV2,
      targetedVault.address,
    ]);

    config = configFileHelper.setVaultTwosideOptimalOnKey(
      targetedVault.name,
      "PancakeswapDnx",
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
func.tags = ["PancakeswapDnxVaultStrategies"];
