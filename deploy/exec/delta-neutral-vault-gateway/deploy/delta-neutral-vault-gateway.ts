import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network, upgrades } from "hardhat";
import {
  DeltaNeutralVaultConfig__factory,
  DeltaNeutralVaultGateway,
  DeltaNeutralVaultGateway__factory,
} from "../../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

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

  interface IDeltaVaultInput {
    name: string;
    address: string;
    deltaVaultConfig: string;
  }

  const deltaVaultInputs: IDeltaVaultInput[] = [
    { name: "Neutral3x WBNB-BUSD Pancakeswap", address: "", deltaVaultConfig: "" },
  ];

  const deployer = (await ethers.getSigners())[0];

  for (let i = 0; i < deltaVaultInputs.length; i++) {
    console.log("===================================================================================");
    console.log(`>> Deploying a DeltaNeutralVaultGateway for ${deltaVaultInputs[i].name}`);
    const DeltaNeutralVaultGateway = (await ethers.getContractFactory(
      "DeltaNeutralVaultGateway",
      deployer
    )) as DeltaNeutralVaultGateway__factory;

    const deltaNeutralVaultGateway = (await upgrades.deployProxy(DeltaNeutralVaultGateway, [
      deltaVaultInputs[i].address,
    ])) as DeltaNeutralVaultGateway;
    await deltaNeutralVaultGateway.deployed();
    console.log(`>> Deployed at ${deltaNeutralVaultGateway.address}`);
    console.log("✅ Done");

    console.log(`Setting DeltaNeutralConfig's WhitelistCallers for DeltaNeutralVaultGateway`);
    const deltaNeutralVaultConfig = DeltaNeutralVaultConfig__factory.connect(
      deltaVaultInputs[i].deltaVaultConfig,
      deployer
    );
    await deltaNeutralVaultConfig.setWhitelistedCallers([deltaNeutralVaultGateway.address], true);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVaultGateway"];
