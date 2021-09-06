# Alpaca Contract

**Leveraged yield farming on Binance Smart Chain**

## Local Development
The following assumes the use of `node@>=10`.  
### Install Dependencies
 1. Copy `.env.example` file and change its name to `.env` in the project folder
 2. Run `yarn` to install all dependencies
### Compile Contracts
`yarn compile`
### Run Tests
`yarn test`
## Licensing
The primary license for Alpaca Protocol is the MIT License, see [MIT LICENSE](https://github.com/alpaca-finance/bsc-alpaca-contract/blob/main/LICENSE).

Exceptions
- Single Asset LYF: `contracts/6/protocol/workers/CakeMaxiWorker.sol` and all files in `contracts/6/protocol/strategies/pancakeswapV2-restricted-single-asset` are licensed under Business Source License 1.1 (`BUSL-1.1`) (as indicated in their SPDX headers), see [BUSL-1.1](https://github.com/alpaca-finance/bsc-alpaca-contract/blob/main/LICENSE_BUSL-1.1)
- All files in `tests` remain unlicensed.