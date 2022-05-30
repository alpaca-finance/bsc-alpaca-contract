# Alpaca Contract

**Leveraged yield farming on BNB Chain and Fantom chain**

## Local Development
The following assumes the use of `node@>=14`.  
### Install Dependencies
 1. Copy `.env.example` file and change its name to `.env` in the project folder
 2. Run `yarn` to install all dependencies
### Compile Contracts
`yarn compile`

Note: There will be a new folder called `typechain` generated in your project workspace. You will need to navigate to `typechain/index.ts` and delete duplicated lines inside this file in order to proceed.
### Run Tests with hardhat
`yarn test`

## Testing with Forge
### Install Forge

```
$ curl -L https://foundry.paradigm.xyz | bash # install foundryup
$ foundryup # install forge and cast
```

### Test
```
$ forge test
```

## Licensing
The primary license for Alpaca Protocol is the MIT License, see [MIT LICENSE](https://github.com/alpaca-finance/bsc-alpaca-contract/blob/main/LICENSE).

Exceptions
- Single Asset LYF: `solidity/contracts/6/protocol/workers/CakeMaxiWorker.sol` and all files in `solidity/contracts/6/protocol/strategies/pancakeswapV2-restricted-single-asset` are licensed under Business Source License 1.1 (`BUSL-1.1`) (as indicated in their SPDX headers), see [BUSL-1.1](https://github.com/alpaca-finance/bsc-alpaca-contract/blob/main/LICENSE_BUSL-1.1)
- Delta Neutral Vault: All files that match `solidity/contracts/8.10/protocol/DeltaNeutral*.sol` and `solidity/contracts/8.13/protocol/DeltaNeutral*.sol` are licensed under Business Source License 1.1 (`BUSL-1.1`) (as indicated in their SPDX headers), see [BUSL-1.1](https://github.com/alpaca-finance/bsc-alpaca-contract/blob/main/LICENSE_BUSL-1.1)
- All files in `tests` remain unlicensed.