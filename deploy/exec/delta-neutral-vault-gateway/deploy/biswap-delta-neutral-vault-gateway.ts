import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { DeltaNeutralVaultConfig__factory, DeltaNeutralVaultGateway } from "../../../../typechain";
import { getConfig } from "../../../entities/config";
import { getDeployer } from "../../../../utils/deployer-helper";
import { UpgradeableContractDeployer } from "../../../deployer";

interface IDeltaVaultInput {
  name: string;
}

interface IDeltaVaultInfo {
  name: string;
  address: string;
  deltaVaultConfig: string;
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
  const deltaVaultInputs: IDeltaVaultInput[] = [
    {
      name: "Market Neutral 3x BNB-USDT BS1",
    },
  ];

  const config = getConfig();
  const deployer = await getDeployer();

  const deltaVaultInfos: IDeltaVaultInfo[] = deltaVaultInputs.map((input) => {
    const deltaVaultInfo = config.DeltaNeutralVaults.find((deltaVault) => input.name === deltaVault.name);

    if (!deltaVaultInfo) throw new Error(`DeltaNeutralVault ${input.name} not found in config`);

    return {
      name: deltaVaultInfo.name,
      address: deltaVaultInfo.address,
      deltaVaultConfig: deltaVaultInfo.config,
    };
  });

  for (let i = 0; i < deltaVaultInfos.length; i++) {
    const deltaVaultGWDeployer = new UpgradeableContractDeployer<DeltaNeutralVaultGateway>(
      deployer,
      "DeltaNeutralVaultGateway",
      deltaVaultInputs[i].name
    );

    const { contract: deltaNeutralVaultGateway } = await deltaVaultGWDeployer.deploy([deltaVaultInfos[i].address]);

    console.log(`>> Setting DeltaNeutralConfig's WhitelistCallers for DeltaNeutralVaultGateway`);
    const deltaNeutralVaultConfig = DeltaNeutralVaultConfig__factory.connect(
      deltaVaultInfos[i].deltaVaultConfig,
      deployer
    );
    await deltaNeutralVaultConfig.setWhitelistedCallers([deltaNeutralVaultGateway.address], true);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVaultGateway"];
