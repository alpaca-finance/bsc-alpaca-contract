import { zeroAddress } from "ethereumjs-util";

export function compare(address0: string, address1: string): boolean {
  return address0.toLowerCase() === address1.toLowerCase();
}

export function validateAddress(address: string): boolean {
  return address !== "" && address !== zeroAddress();
}
