import { ethers } from "hardhat";
import { Timelock, Timelock__factory, Vault__factory } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { VaultsEntity } from "../deploy/interfaces/config";
import { getConfig } from "../deploy/entities/config";

interface IReserve {
  vault: string;
  fullAmount: string;
  buybackAmount: string;
}

async function _queueWithdrawReserve(
  timelock: Timelock,
  deployer: SignerWithAddress,
  vaultInfo: VaultsEntity,
  eta: number,
  nonce: number
): Promise<IReserve> {
  console.log(`========== queue tx for withdrawing reserve pool from ${vaultInfo.symbol} ==========`);
  const vault = Vault__factory.connect(vaultInfo.address, deployer);
  const decimals = await vault.decimals();
  const reserveAmt = await vault.reservePool();

  const queueTx = await timelock.queueTransaction(
    vault.address,
    "0",
    "withdrawReserve(address,uint256)",
    ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [deployer.address, reserveAmt]),
    eta,
    { nonce }
  );

  console.log(`> queued tx to withdraw reserve hash: ${queueTx.hash}`);

  console.log(`> generate execute command for ${vaultInfo.symbol}`);
  console.log(
    `await timelock.executeTransaction('${vault.address}', '0', 'withdrawReserve(address,uint256)', ethers.utils.defaultAbiCoder.encode(['address','uint256'],['${deployer.address}', '${reserveAmt}']), ${eta})`
  );
  console.log("> ✅ done");

  return {
    vault: vaultInfo.symbol.replace("ib", ""),
    fullAmount: ethers.utils.formatUnits(reserveAmt, decimals),
    buybackAmount: ethers.utils.formatUnits(reserveAmt.mul("5263").div("10000"), decimals),
  };
}

async function main() {
  const config = getConfig();
  const deployer = (await ethers.getSigners())[0];
  let nonce = await deployer.getTransactionCount();

  /// @dev initialized all variables
  const reserves: Array<IReserve> = [];
  const eta = Math.floor(Date.now() / 1000) + 86400 + 1800;

  /// @dev connect to Timelock
  const timelock = Timelock__factory.connect(config.Timelock, deployer);

  /// @dev find vault info
  const vaultInfo = config.Vaults;

  const promises = [];
  for (let i = 0; i < vaultInfo.length; i++) {
    promises.push(_queueWithdrawReserve(timelock, deployer, vaultInfo[i], eta, nonce));
    nonce = nonce + 1;
  }
  reserves.push(...(await Promise.all(promises)));

  /// @dev display reserve to be withdrawn
  console.log("========== reserve withdraw summary ==========");
  console.table(reserves);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
