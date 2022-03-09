import axios from "axios";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { IGasPriceService } from "../interfaces";
import { IBlockScanGasResponse } from "./interfaces";

export class BlockScanGasPrice implements IGasPriceService {
  private networkName: string;
  private baseUrl: string;

  constructor(networkName: string) {
    let networkShorthand = "bsc";
    if (networkName === "fantom_mainnet" || networkName === "fantom_testnet") networkShorthand = "ftm";

    this.baseUrl = `https://g${networkShorthand}.blockscan.com`;
    this.networkName = networkName;
  }

  async getFastGasPrice(): Promise<BigNumber> {
    if (this.networkName === "testnet") return ethers.utils.parseUnits("15", "gwei");

    const raw = await axios.get(`${this.baseUrl}/gasapi.ashx?apikey=key&method=gasoracle`);
    const resp = raw.data as IBlockScanGasResponse;
    return ethers.utils.parseUnits(resp.result.FastGasPrice, "gwei");
  }
}
