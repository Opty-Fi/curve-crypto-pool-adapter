// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "solidity-coverage";
import { resolve } from "path";
import { config as dotenvConfig } from "dotenv";
import { HardhatUserConfig, NetworkUserConfig } from "hardhat/types";
import {
  eArbitrumNetwork,
  eAvalancheNetwork,
  eBinanceSmartChainNetwork,
  eEthereumNetwork,
  eFantomNetwork,
  eNetwork,
  eOptimisticEthereumNetwork,
  ePolygonNetwork,
  eXDaiNetwork,
} from "./helpers/types";
import { NETWORKS_RPC_URL, buildForkConfig, NETWORKS_CHAIN_ID, NETWORKS_DEFAULT_GAS } from "./helper-hardhat-config";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const HARDFORK = "london";
const MNEMONIC_PATH = "m/44'/60'/0'/0";
const MNEMONIC = process.env.MNEMONIC || "";
const NETWORK = process.env.NETWORK || "hardhat";

const getCommonNetworkConfig = (networkName: eNetwork): NetworkUserConfig | undefined => ({
  url: NETWORKS_RPC_URL[networkName],
  hardfork: HARDFORK,
  gasPrice: "auto",
  chainId: NETWORKS_CHAIN_ID[networkName],
  initialBaseFeePerGas: 1_00_000_000,
  accounts: {
    mnemonic: MNEMONIC,
    path: MNEMONIC_PATH,
    initialIndex: 0,
    count: 20,
    accountsBalance: "10000000000000000000000",
  },
});

const config: HardhatUserConfig = {
  networks: {
    kovan: getCommonNetworkConfig(eEthereumNetwork.kovan),
    ropsten: getCommonNetworkConfig(eEthereumNetwork.ropsten),
    main: getCommonNetworkConfig(eEthereumNetwork.main),
    rinkeby: getCommonNetworkConfig(eEthereumNetwork.main),
    goerli: getCommonNetworkConfig(eEthereumNetwork.main),
    matic: getCommonNetworkConfig(ePolygonNetwork.matic),
    mumbai: getCommonNetworkConfig(ePolygonNetwork.mumbai),
    xdai: getCommonNetworkConfig(eXDaiNetwork.xdai),
    avalanche: getCommonNetworkConfig(eAvalancheNetwork.avalanche),
    fuji: getCommonNetworkConfig(eAvalancheNetwork.fuji),
    arbitrum1: getCommonNetworkConfig(eArbitrumNetwork.arbitrum1),
    rinkeby_arbitrum1: getCommonNetworkConfig(eArbitrumNetwork.rinkeby_arbitrum1),
    fantom: getCommonNetworkConfig(eFantomNetwork.fantom),
    fantom_test: getCommonNetworkConfig(eFantomNetwork.fantom_test),
    bsc: getCommonNetworkConfig(eBinanceSmartChainNetwork.bsc),
    bsc_test: getCommonNetworkConfig(eBinanceSmartChainNetwork.bsc_test),
    oethereum: getCommonNetworkConfig(eOptimisticEthereumNetwork.oethereum),
    kovan_oethereum: getCommonNetworkConfig(eOptimisticEthereumNetwork.kovan_oethereum),
    goerli_oethereum: getCommonNetworkConfig(eOptimisticEthereumNetwork.goerli_oethereum),
    hardhat: {
      hardfork: "merge",
      gasPrice: "auto",
      chainId: NETWORKS_CHAIN_ID[NETWORK],
      initialBaseFeePerGas: 1_00_000_000,
      accounts: {
        initialIndex: 0,
        count: 20,
        mnemonic: MNEMONIC,
        path: MNEMONIC_PATH,
        accountsBalance: "10000000000000000000000",
      },
      forking: buildForkConfig(),
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.11",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  mocha: {
    timeout: 0,
  },
};

export default config;
