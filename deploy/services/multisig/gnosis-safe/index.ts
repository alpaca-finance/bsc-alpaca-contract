import Safe from "@safe-global/safe-core-sdk";
import { EthAdapter, SafeTransactionDataPartial } from "@safe-global/safe-core-sdk-types";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient from "@safe-global/safe-service-client";
import { BigNumberish, ethers } from "ethers";
import { MultiSigServiceInterface } from "../interface";

export class GnosisSafeMultiSigService implements MultiSigServiceInterface {
  private _safeAddress: string;
  private _ethAdapter: EthAdapter;
  private _safeServiceClient: SafeServiceClient;
  private _signer: ethers.Signer;

  constructor(chainId: number, safeAddress: string, signer: ethers.Signer) {
    let safeTxServiceUrl = "";
    switch (chainId) {
      case 56:
        safeTxServiceUrl = "https://safe-transaction-bsc.safe.global/";
        break;
      default:
        throw new Error("Unsupported chain ID");
    }

    this._safeAddress = safeAddress;
    this._ethAdapter = new EthersAdapter({
      ethers,
      signerOrProvider: signer,
    });
    this._safeServiceClient = new SafeServiceClient({
      txServiceUrl: safeTxServiceUrl,
      ethAdapter: this._ethAdapter,
    });
    this._signer = signer;
  }

  async proposeTransaction(to: string, value: BigNumberish, data: string): Promise<string> {
    let safeSdk = await Safe.create({ ethAdapter: this._ethAdapter, safeAddress: this._safeAddress });

    const safeTransactionData: SafeTransactionDataPartial = {
      to,
      value: value.toString(),
      data,
      nonce: await this._safeServiceClient.getNextNonce(this._safeAddress),
    };

    const safeTransaction = await safeSdk.createTransaction({
      safeTransactionData,
    });
    const senderAddress = await this._signer.getAddress();
    const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
    const signature = await safeSdk.signTransactionHash(safeTxHash);

    await this._safeServiceClient.proposeTransaction({
      safeAddress: this._safeAddress,
      safeTransactionData: safeTransaction.data,
      safeTxHash,
      senderAddress,
      senderSignature: signature.data,
    });

    return safeTxHash;
  }
}
