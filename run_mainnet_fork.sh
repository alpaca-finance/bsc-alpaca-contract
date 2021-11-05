if [ -f .env ]
then
  export $(cat .env | sed 's/#.*//g' | xargs)
fi

if [ -z ${BSC_MAINNET_ARCHIVE_RPC:-} ]; then
    echo "environments are invalid"
else
    echo "creating a mainnet fork node ${BSC_MAINNET_ARCHIVE_RPC}"
    npx hardhat node --fork ${BSC_MAINNET_ARCHIVE_RPC} --no-deploy
fi;