import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { DeltaNeutralVaultConfig02__factory } from "../../../../typechain";
import { Converter } from "../../../helper";

interface ISetFeesInput {
  deltaVaultSymbol: string;
  newDepositFeeTreasury: string;
  newDepositFeeBps: number;
  newWithdrawalFeeTreasury: string;
  newWithdrawalFeeBps: number;
  newManagementFeeTreasury: string;
  newManagementFeePerSec: number;
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

  const CONFIG_SET_FEES_INPUT: ISetFeesInput[] = [
    {
      deltaVaultSymbol: "n8x-BUSDUSDT-PCS1",
      newDepositFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newDepositFeeBps: 0,
      newWithdrawalFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newWithdrawalFeeBps: 0,
      newManagementFeeTreasury: "0x7e2308437c2f4c8934214663dc8476037625a270",
      newManagementFeePerSec: 0,
    },
    {
      deltaVaultSymbol: "L3x-BUSDBNB-PCS1",
      newDepositFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newDepositFeeBps: 0,
      newWithdrawalFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newWithdrawalFeeBps: 0,
      newManagementFeeTreasury: "0x7e2308437c2f4c8934214663dc8476037625a270",
      newManagementFeePerSec: 0,
    },
    {
      deltaVaultSymbol: "L8x-BUSDBNB-PCS1",
      newDepositFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newDepositFeeBps: 0,
      newWithdrawalFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newWithdrawalFeeBps: 0,
      newManagementFeeTreasury: "0x7e2308437c2f4c8934214663dc8476037625a270",
      newManagementFeePerSec: 0,
    },
    {
      deltaVaultSymbol: "L8x-USDTBNB-BSW1",
      newDepositFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newDepositFeeBps: 0,
      newWithdrawalFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newWithdrawalFeeBps: 0,
      newManagementFeeTreasury: "0x7e2308437c2f4c8934214663dc8476037625a270",
      newManagementFeePerSec: 0,
    },
    {
      deltaVaultSymbol: "L8x-USDTBNB-PCS1",
      newDepositFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newDepositFeeBps: 0,
      newWithdrawalFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newWithdrawalFeeBps: 0,
      newManagementFeeTreasury: "0x7e2308437c2f4c8934214663dc8476037625a270",
      newManagementFeePerSec: 0,
    },
    {
      deltaVaultSymbol: "L3x-BUSDBTCB-PCS1",
      newDepositFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newDepositFeeBps: 0,
      newWithdrawalFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newWithdrawalFeeBps: 0,
      newManagementFeeTreasury: "0x7e2308437c2f4c8934214663dc8476037625a270",
      newManagementFeePerSec: 0,
    },
    {
      deltaVaultSymbol: "n3x-BNBUSDT-PCS1",
      newDepositFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newDepositFeeBps: 0,
      newWithdrawalFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newWithdrawalFeeBps: 0,
      newManagementFeeTreasury: "0x7e2308437c2f4c8934214663dc8476037625a270",
      newManagementFeePerSec: 0,
    },
    {
      deltaVaultSymbol: "n3x-BNBBUSD-PCS1",
      newDepositFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newDepositFeeBps: 0,
      newWithdrawalFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newWithdrawalFeeBps: 0,
      newManagementFeeTreasury: "0x7e2308437c2f4c8934214663dc8476037625a270",
      newManagementFeePerSec: 0,
    },
    {
      deltaVaultSymbol: "n8x-BNBUSDT-PCS1",
      newDepositFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newDepositFeeBps: 0,
      newWithdrawalFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newWithdrawalFeeBps: 0,
      newManagementFeeTreasury: "0x7e2308437c2f4c8934214663dc8476037625a270",
      newManagementFeePerSec: 0,
    },
    {
      deltaVaultSymbol: "n8x-BNBUSDT-PCS2",
      newDepositFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newDepositFeeBps: 0,
      newWithdrawalFeeTreasury: "0x417d3e491cbaad07b2433781e50bc6cd09641bc0",
      newWithdrawalFeeBps: 0,
      newManagementFeeTreasury: "0x7e2308437c2f4c8934214663dc8476037625a270",
      newManagementFeePerSec: 0,
    },
  ];

  const deployer = await getDeployer();

  const converter = new Converter();

  console.log(">> SetFees to DeltaNeutralVaultConfig02 contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { gasLimit: 2000000 } : {};
  for (const input of CONFIG_SET_FEES_INPUT) {
    const vault = converter.convertDeltaSymboltoObj([input.deltaVaultSymbol])[0];
    const deltaVaultConfig = DeltaNeutralVaultConfig02__factory.connect(vault.config, deployer);

    console.log(">> Seting Fees for:", input.deltaVaultSymbol);
    await deltaVaultConfig.setFees(
      input.newDepositFeeTreasury,
      input.newDepositFeeBps,
      input.newWithdrawalFeeTreasury,
      input.newWithdrawalFeeBps,
      input.newManagementFeeTreasury,
      input.newManagementFeePerSec,
      {
        ...ops,
        nonce: nonce++,
      }
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVaultConfigSetFees"];
