import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { DeltaNeutralVaultConfig02__factory } from "../../../../typechain";
import { Converter } from "../../../helper";
import { ethers } from "ethers";

interface ISetVaultLimitInput {
  vaultSymbol: string;
  limit: ethers.BigNumber;
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

  const VAULT_LIMIT_INPUTS: Array<ISetVaultLimitInput> = [
    {
      vaultSymbol: "n8x-BUSDUSDT-PCS1",
      limit: ethers.utils.parseEther("0"),
    },
    {
      vaultSymbol: "L3x-BUSDBNB-PCS1",
      limit: ethers.utils.parseEther("0"),
    },
    {
      vaultSymbol: "L8x-BUSDBNB-PCS1",
      limit: ethers.utils.parseEther("0"),
    },
    {
      vaultSymbol: "L8x-USDTBNB-BSW1",
      limit: ethers.utils.parseEther("0"),
    },
    {
      vaultSymbol: "L8x-USDTBNB-PCS1",
      limit: ethers.utils.parseEther("0"),
    },
    {
      vaultSymbol: "L3x-BUSDBTCB-PCS1",
      limit: ethers.utils.parseEther("0"),
    },
    {
      vaultSymbol: "n3x-BNBUSDT-PCS1",
      limit: ethers.utils.parseEther("0"),
    },
    {
      vaultSymbol: "n3x-BNBBUSD-PCS1",
      limit: ethers.utils.parseEther("0"),
    },
    {
      vaultSymbol: "n8x-BNBUSDT-PCS1",
      limit: ethers.utils.parseEther("0"),
    },
    {
      vaultSymbol: "n8x-BNBUSDT-PCS2",
      limit: ethers.utils.parseEther("0"),
    },
  ];

  const deployer = await getDeployer();
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { gasLimit: 2000000 } : {};

  const converter = new Converter();

  for (const vaultLimitInput of VAULT_LIMIT_INPUTS) {
    const configs = converter.convertDeltaSymbolToAddress([vaultLimitInput.vaultSymbol], "config");

    console.log(`> Set limit to ${ethers.utils.formatEther(vaultLimitInput.limit)} for ${vaultLimitInput.vaultSymbol}`);
    const deltaVaultConfig = DeltaNeutralVaultConfig02__factory.connect(configs[0], deployer);
    const tx = await deltaVaultConfig.setValueLimit(vaultLimitInput.limit, { ...ops, nonce: nonce++ });
    console.log(`> ⛓ Tx is sent: ${tx.hash}`);
  }
};

export default func;
func.tags = ["DeltaNeutralVaultConfigSetVaultLimit"];
