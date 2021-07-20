export interface Transaction {
  info: string
  queuedAt: string
  executedAt: string
  executionTransaction: string
  target: string,
  value: string,
  signature: string,
  paramTypes: Array<string>,
  params: Array<any>,
  eta: string,
}