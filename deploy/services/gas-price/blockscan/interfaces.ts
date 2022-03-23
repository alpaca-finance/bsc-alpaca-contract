export interface IBlockScanGasResponse {
  status: string
  message: string
  result: IBlockScanGasResult
}

export interface IBlockScanGasResult {
  LastBlock: string
  SafeGasPrice: string
  ProposeGasPrice: string
  FastGasPrice: string
  UsdPrice: string
}
