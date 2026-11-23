/* Padhaus — registri jaringan (multi-chain).
 *
 * SATU-SATUNYA sumber kebenaran front-end soal jaringan. Semua halaman
 * (index / launch / token) membaca dari sini lewat app.js — tidak ada lagi
 * chain ID / RPC / alamat factory yang ditulis keras di halaman.
 *
 * Menambah chain EVM baru = tambah satu entri di PADHAUS_CHAINS (+ urutan
 * tampil di PADHAUS_CHAIN_ORDER). Format tiap entri:
 *
 *   chainId        number        ID jaringan EVM.
 *   name           string        Nama tampil (dropdown, badge, wallet).
 *   rpcUrl         string        RPC publik untuk baca on-chain.
 *   factoryAddress string|null   Alamat LaunchpadFactory di chain ini.
 *                                null = BELUM terdeploy: UI menandai
 *                                "not deployed yet" dan menonaktifkan
 *                                semua aksi tulis (launch / buy / sell).
 *   nativeSymbol   string        Simbol koin native (ETH, BNB, tBNB, …).
 *   nativeName     string        Nama koin native (untuk wallet_addEthereumChain).
 *   explorerUrl    string|null   Block explorer (null bila belum terverifikasi).
 *   testnet        boolean       true = jaringan uji (uang tidak nyata).
 *
 * Preset deploy per chain (parameter kurva, router, kunci deployer) ada di
 * folder chains/ di root proyek — lihat chains/README.md.
 */
const PADHAUS_CHAINS = {
  // Chain default & satu-satunya yang sudah terdeploy (Milestone 2).
  // Alamat factory = deployment LIVE di deployment-testnet.json; app.js
  // tetap membaca file itu dan memakainya sebagai override untuk chain ini
  // bila chainId-nya cocok, jadi redeploy testnet tidak perlu edit file ini.
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
  // Preset — belum terdeploy (factoryAddress null). Router graduasi untuk
  // chain ini masih TODO-VERIFY (lihat chains/robinhood-chain.json).
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
  // Preset — belum terdeploy (factoryAddress null).
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
  // Preset — belum terdeploy (factoryAddress null). Router graduasi untuk
  // chain ini masih TODO-VERIFY (lihat chains/base.json).
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

/* Urutan tampil di dropdown pemilih jaringan (chain default pertama). */
const PADHAUS_CHAIN_ORDER = [97, 4663, 56, 8453];

/* Chain aktif bila pengguna belum pernah memilih. */
const PADHAUS_DEFAULT_CHAIN_ID = 97;
