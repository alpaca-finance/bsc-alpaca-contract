import { BigNumberish } from "ethers"

export interface MultiSigServiceInterface {
  proposeTransaction(
    to: string,
    value: BigNumberish,
    data: string,
  ): Promise<string>
}
