import { Contract } from "ethers";

export interface IMulticallCall {
  address: string; // Address of the contract
  name: string; // Function name on the contract (example: balanceOf)
  params?: any[]; // Function params
}

export interface IMultiContractCall {
  contract: Contract;
  functionName: string; // Function name on the contract (example: balanceOf)
  params?: any[]; // Function params
}

export interface IMulticallInfo {
  name: string;
  address: string;
}

export interface ContractCallOptions {
  blockNumber?: number;
}

export interface IMultiCallService {
  multiContractCall<T>(calls: IMultiContractCall[], contractCallOptions?: ContractCallOptions): Promise<T>;
}
