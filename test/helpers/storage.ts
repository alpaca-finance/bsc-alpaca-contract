import { BigNumberish } from "ethers";
import { ethers, network, upgrades, waffle } from "hardhat";

export interface ISetStorageInput {
  slot: string;
  data: string;
}

export async function setBep20Balance(token: string, address: string, slot: number, balance: BigNumberish) {
  const balanceBN = ethers.BigNumber.from(balance);
  const index = ethers.utils.solidityKeccak256(["uint256", "uint256"], [address, slot]);
  const manipulatedBalance = ethers.utils.hexlify(ethers.utils.zeroPad(balanceBN.toHexString(), 32)).toString();
  await network.provider.request({
    method: "hardhat_setStorageAt",
    params: [token, index, manipulatedBalance],
  });
}
