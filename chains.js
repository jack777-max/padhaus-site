/* Padhaus — network registry (multi-chain).
 *
 * The SINGLE source of truth for the front end's networks. Every page
 * (index / launch / token) reads from here via app.js — no chain ID, RPC,
 * or factory address is hardcoded in the pages anymore.
 *
 * Adding a new EVM chain = add one entry to PADHAUS_CHAINS (+ its display
 * order in PADHAUS_CHAIN_ORDER). Entry format:
 *
 *   chainId        number        EVM network ID.
 *   name           string        Display name (dropdown, badge, wallet).
 *   rpcUrl         string|null   Public RPC for on-chain reads.
 *                                null = no public RPC available yet.
 *   factoryAddress string|null   LaunchpadFactory address on this chain.
 *                                null = NOT deployed yet: the UI marks it
 *                                "not deployed yet" and disables all write
 *                                actions (launch / buy / sell).
 *   nativeSymbol   string        Native coin symbol (ETH, BNB, tBNB, …).
 *   nativeName     string        Native coin name (for wallet_addEthereumChain).
 *   explorerUrl    string|null   Block explorer (null if not yet verified).
 *   testnet        boolean       true = test network (not real money).
 *
 * Per-chain deploy presets (curve parameters, router, deployer key) live
 * in the chains/ folder at the project root — see chains/README.md.
 */
const PADHAUS_CHAINS = {
  // Default chain & the only one deployed so far (Milestone 2).
  // Factory address = the LIVE deployment in deployment-testnet.json; app.js
  // still reads that file and uses its address as an override for this chain
  // when the file's chainId matches, so a testnet redeploy needs no edit here.
  97: {
    chainId: 97,
    name: "BSC Testnet",
    rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
    factoryAddress: "0xa6Bde26F2d09898DdA8Fc72aCD7BFDA0129f7FD1",
    nativeSymbol: "tBNB",
    nativeName: "Test BNB",
    explorerUrl: "https://testnet.bscscan.com",
    testnet: true
  },
  // Preset — not deployed yet (factoryAddress null). The graduation router
  // for this chain is still TODO-VERIFY (see chains/robinhood-chain.json).
  4663: {
    chainId: 4663,
    name: "Robinhood Chain",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    factoryAddress: null,
    nativeSymbol: "ETH",
    nativeName: "Ether",
    explorerUrl: null,
    testnet: false
  },
  // Preset — not deployed yet (factoryAddress null).
  56: {
    chainId: 56,
    name: "BNB Smart Chain",
    rpcUrl: "https://bsc-dataseed.bnbchain.org",
    factoryAddress: null,
    nativeSymbol: "BNB",
    nativeName: "BNB",
    explorerUrl: "https://bscscan.com",
    testnet: false
  },
  // Preset — not deployed yet (factoryAddress null). Added 2026-11-23 at
  // Ahmad's request; RPC verified live (eth_chainId = 0x1).
  // Graduation router still TODO-VERIFY (see chains/ethereum.json).
  1: {
    chainId: 1,
    name: "Ethereum",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    factoryAddress: null,
    nativeSymbol: "ETH",
    nativeName: "Ether",
    explorerUrl: "https://etherscan.io",
    testnet: false
  },
  // Preset — not deployed yet (factoryAddress null). The chain is NOT on
  // mainnet yet: Zero (LayerZero) launches mainnet on 30 Nov 2026 (chainId
  // 33002, gas ZRO); as of 23 Nov 2026 there is no public RPC/explorer, so
  // rpcUrl is null. The zero-chain-watch monitor reports the official
  // parameters as soon as they are published, then this entry gets filled
  // in. Graduation router TODO-VERIFY (chains/zero.json).
  33002: {
    chainId: 33002,
    name: "Zero (LayerZero)",
    rpcUrl: null,
    factoryAddress: null,
    nativeSymbol: "ZRO",
    nativeName: "ZRO",
    explorerUrl: null,
    testnet: false
  },
  // Preset — not deployed yet (factoryAddress null). The graduation router
  // for this chain is still TODO-VERIFY (see chains/base.json).
  8453: {
    chainId: 8453,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    factoryAddress: null,
    nativeSymbol: "ETH",
    nativeName: "Ether",
    explorerUrl: "https://basescan.org",
    testnet: false
  }
};

/* Display order in the network switcher dropdown (default chain first). */
const PADHAUS_CHAIN_ORDER = [97, 4663, 56, 8453, 1, 33002];

/* Active chain when the user has never picked one. */
const PADHAUS_DEFAULT_CHAIN_ID = 97;
