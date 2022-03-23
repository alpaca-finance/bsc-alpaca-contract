import { ethers } from "ethers";
import { Multicall, Multicall__factory } from "../../../../typechain";
import { ContractCallOptions, IMultiCallService, IMultiContractCall } from "../interfaces";

export class Multicall2Service implements IMultiCallService {
  private multicallInstance: Multicall;

  constructor(_multicallAddress: string, _signerOrProvider: ethers.Signer | ethers.providers.Provider) {
    this.multicallInstance = Multicall__factory.connect(_multicallAddress, _signerOrProvider);
  }

  public async multiContractCall<T>(
    calls: IMultiContractCall[],
    contractCallOptions?: ContractCallOptions
  ): Promise<T> {
    let blockNumber = undefined;
    if (contractCallOptions) blockNumber = contractCallOptions.blockNumber;

    return this._multiCall(calls, blockNumber);
  }

  private async _multiCall<T>(calls: IMultiContractCall[], blockNumber?: number): Promise<T> {
    try {
      const calldata = calls.map((call) => {
        return {
          target: call.contract.address.toLowerCase(),
          callData: call.contract.interface.encodeFunctionData(call.functionName, call.params),
        };
      });

      const { returnData } = await this.multicallInstance.callStatic.aggregate(calldata, {
        blockTag: blockNumber,
      });

      const res = returnData.map((call, i) => {
        const result = calls[i].contract.interface.decodeFunctionResult(calls[i].functionName, call);

        if (result.length === 1) return result[0];
        return result;
      });

      return res as unknown as T;
    } catch (error) {
      throw new Error(error as string);
    }
  }
}
