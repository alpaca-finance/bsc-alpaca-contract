import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Timelock__factory } from '../../../../../typechain'

interface IResetApproved {
    TOKEN: string
    SPENDER: string
}

interface IResetApprovalParams {
    WORKER_NAME: string
    WORKER_ADDR: string
    RESET_APPROVED: Array<IResetApproved>
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
  ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
  ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
  ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
  ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
  ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
  ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
  Check all variables below before execute the deployment script
  */

  const RESET_APPROVED: Array<IResetApprovalParams> = [{
    WORKER_NAME: "CAKE-WBNB Worker",
    WORKER_ADDR: "0x7Af938f0EFDD98Dc513109F6A7E85106D26E16c4",
    RESET_APPROVED: [{
        TOKEN: '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0xa527a61703d82139f8a06bc30097cc9caa2df5a6', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0xa527a61703d82139f8a06bc30097cc9caa2df5a6', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "BTCB-WBNB Worker",
    WORKER_ADDR: "0x0aD12Bc160B523E7aBfBe3ABaDceE8F1b6116089",
    RESET_APPROVED: [{
        TOKEN: '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0x7561eee90e24f3b348e1087a005f78b4c8453524', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0x7561eee90e24f3b348e1087a005f78b4c8453524', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "ETH-WBNB Worker",
    WORKER_ADDR: "0x831332f94C4A0092040b28ECe9377AfEfF34B25a",
    RESET_APPROVED: [{
        TOKEN: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0x70d8929d04b60af4fb9b58713ebcf18765ade422', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0x70d8929d04b60af4fb9b58713ebcf18765ade422', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "DOT-WBNB Worker",
    WORKER_ADDR: "0x05bDF33f03017eaFdEEccD68406E1281a1deF62d",
    RESET_APPROVED: [{
        TOKEN: '0x7083609fce4d1d8dc0c979aab8c869ea2c873402',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0xbCD62661A6b1DEd703585d3aF7d7649Ef4dcDB5c', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0xbCD62661A6b1DEd703585d3aF7d7649Ef4dcDB5c', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "UNI-WBNB Worker",
    WORKER_ADDR: "0xA1644132Ca692ba0657637A31CE0F6B99f052C5E",
    RESET_APPROVED: [{
        TOKEN: '0xbf5140a22578168fd562dccf235e5d43a02ce9b1',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0x4269e7F43A63CEA1aD7707Be565a94a9189967E9', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0x4269e7F43A63CEA1aD7707Be565a94a9189967E9', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "LINK-WBNB Worker",
    WORKER_ADDR: "0xDcd9f075B1Ff638e757226626a3b3606D7795f80",
    RESET_APPROVED: [{
        TOKEN: '0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0xaeBE45E3a03B734c68e5557AE04BFC76917B4686', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0xaeBE45E3a03B734c68e5557AE04BFC76917B4686', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "XVS-WBNB Worker",
    WORKER_ADDR: "0xBB77F1625c4C3374ea0BAF42FAC74F7b7Ae9E4c6",
    RESET_APPROVED: [{
        TOKEN: '0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0x41182c32F854dd97bA0e0B1816022e0aCB2fc0bb', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0x41182c32F854dd97bA0e0B1816022e0aCB2fc0bb', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "YFI-WBNB Worker",
    WORKER_ADDR: "0x2E7f32e38EA5a5fcb4494d9B626d2d393B176B1E",
    RESET_APPROVED: [{
        TOKEN: '0x88f1a5ae2a3bf98aeaf342d26b30a79438c9142e',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0x68Ff2ca47D27db5Ac0b5c46587645835dD51D3C1', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0x68Ff2ca47D27db5Ac0b5c46587645835dD51D3C1', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "ITAM-WBNB Worker",
    WORKER_ADDR: "0x4193D35D0cB598d92703ED69701f5d568aCa015c",
    RESET_APPROVED: [{
        TOKEN: '0x04c747b40be4d535fc83d09939fb0f626f32800b',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0xCdC53345192D0e31eEAD03D7E9e008Ee659FAEbE', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0xCdC53345192D0e31eEAD03D7E9e008Ee659FAEbE', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "USDT-BUSD Worker",
    WORKER_ADDR: "0xC5954CA8988988362f60498d5aDEc67BA466492B",
    RESET_APPROVED: [{
        TOKEN: '0x55d398326f99059ff775485246999027b3197955',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0xc15fa3e22c912a276550f3e5fe3b0deb87b55acd', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0xc15fa3e22c912a276550f3e5fe3b0deb87b55acd', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "WBNB-BUSD Worker",
    WORKER_ADDR: "0x51782E39A0aF33f542443419c223434Bb4A5a695",
    RESET_APPROVED: [{
        TOKEN: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0x1b96b92314c44b159149f7e0303511fb2fc4774f', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0x1b96b92314c44b159149f7e0303511fb2fc4774f', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "VAI-BUSD Worker",
    WORKER_ADDR: "0x693430Fe5F1b0a61b232132d0567295c288eA482",
    RESET_APPROVED: [{
        TOKEN: '0x4bd17003473389a42daf6a0a729f6fdb328bbbd7',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0xfF17ff314925Dff772b71AbdFF2782bC913B3575', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0xfF17ff314925Dff772b71AbdFF2782bC913B3575', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "USDC-BUSD Worker",
    WORKER_ADDR: "0xB82B93FcF1818513889c0E1F3628484Ce5017A14",
    RESET_APPROVED: [{
        TOKEN: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0x680Dd100E4b394Bda26A59dD5c119A391e747d18', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0x680Dd100E4b394Bda26A59dD5c119A391e747d18', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "DAI-BUSD Worker",
    WORKER_ADDR: "0xe632ac75f2d0A97F7b1ef3a8a16d653C4c82b1fb",
    RESET_APPROVED: [{
        TOKEN: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0x3aB77e40340AB084c3e23Be8e5A6f7afed9D41DC', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0x3aB77e40340AB084c3e23Be8e5A6f7afed9D41DC', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "UST-BUSD Worker",
    WORKER_ADDR: "0xeBdECF3a21D95453A89440A4E32B9559E47073E7",
    RESET_APPROVED: [{
        TOKEN: '0x23396cf899ca06c4472205fc903bdb4de249d6fc',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0xD1F12370b2ba1C79838337648F820a87eDF5e1e6', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0xD1F12370b2ba1C79838337648F820a87eDF5e1e6', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "COMP-ETH Worker",
    WORKER_ADDR: "0xd6260DB3A84C7BfdAFcD82325397B8E70B39627f",
    RESET_APPROVED: [{
        TOKEN: '0x52ce071bd9b1c4b00a0b92d298c512478cad67e8',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0x0392957571F28037607C14832D16f8B653eDd472', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0x0392957571F28037607C14832D16f8B653eDd472', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }, {
    WORKER_NAME: "SUSHI-ETH Worker",
    WORKER_ADDR: "0xaA5c95181c02DfB8173813149e52c8C9E4E14124",
    RESET_APPROVED: [{
        TOKEN: '0x947950bcc74888a40ffa2593c5798f11fc9124c4',
        SPENDER: '0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900'
    }, {
        TOKEN: '0x17580340F3dAEDAE871a8C21D15911742ec79e0F', // lpV1
        SPENDER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56' // routerV2
    }, {
        TOKEN: '0x17580340F3dAEDAE871a8C21D15911742ec79e0F', // lpV1
        SPENDER: '0x73feaa1eE314F8c655E354234017bE2193C9E24E' // masterChef
    }]
  }];
    
  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1619231400';











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  for(let i = 0; i < RESET_APPROVED.length; i++) {
    const resetApproved = RESET_APPROVED[i]
    for(let j = 0; j < resetApproved.RESET_APPROVED.length; j++) {
        console.log(`>> Timelock: reset approval ${resetApproved.RESET_APPROVED[j].SPENDER} to spend ${resetApproved.RESET_APPROVED[j].TOKEN}: "${resetApproved.WORKER_NAME}" via Timelock`);
        await timelock.queueTransaction(
            resetApproved.WORKER_ADDR, '0',
            'resetApproval(address,address)',
            ethers.utils.defaultAbiCoder.encode(
                ['address', 'address'],
                [
                    resetApproved.RESET_APPROVED[j].TOKEN,
                    resetApproved.RESET_APPROVED[j].SPENDER,
                ]
            ), EXACT_ETA
        );
        console.log("generate timelock.executeTransaction:")
        console.log(`await timelock.executeTransaction('${resetApproved.WORKER_ADDR}', '0', 'resetApproval(address,address)', ethers.utils.defaultAbiCoder.encode(['address', 'address'],['${resetApproved.RESET_APPROVED[j].TOKEN}','${resetApproved.RESET_APPROVED[j].SPENDER}']), ${EXACT_ETA})`)
        console.log("✅ Done");
    }
  }
};

export default func;
func.tags = ['TimelockWorkersResetApproval'];