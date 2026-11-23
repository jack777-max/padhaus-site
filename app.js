/* Padhaus — front-end skeleton (Milestone 2)
 * Membaca alamat kontrak dari ../deployment-testnet.json.
 * Baca (read) lewat RPC publik BSC Testnet; tulis (write) lewat wallet
 * browser (MetaMask) yang terhubung ke chain ID 97.
 * BELUM di-hosting di mana pun — jalankan lokal, lihat README.md.
 */
const DEFAULT_RPC = "https://bsc-testnet-rpc.publicnode.com";
const CHAIN_ID = 97;

const FACTORY_ABI = [
  "function tokenCount() view returns (uint256)",
  "function allTokens(uint256) view returns (address)",
  "function getCurve(address) view returns (tuple(address creator, string metadataURI, uint256 virtualQuote, uint256 virtualToken, uint256 realQuote, uint256 tokensSold, bool graduated))",
  "function spotPrice(address) view returns (uint256)",
  "function quoteBuy(address, uint256) view returns (uint256 tokensOut, uint256 fee)",
  "function quoteSell(address, uint256) view returns (uint256 netOut, uint256 fee)",
  "function creatorFees(address) view returns (uint256)",
  "function createToken(string name_, string symbol_, string metadataURI, uint256 feeBps_) returns (address)",
  "function buy(address token, uint256 minTokensOut) payable",
  "function sell(address token, uint256 tokenAmount, uint256 minQuoteOut)"
];
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)"
];

let deployment = null;
let readProvider = null;

async function loadDeployment() {
  const candidates = ["../deployment-testnet.json", "./deployment-testnet.json", "../../deployment-testnet.json"];
  for (const path of candidates) {
    try {
      const res = await fetch(path);
      if (res.ok) { deployment = await res.json(); return deployment; }
    } catch (_) { /* coba path berikutnya */ }
  }
  throw new Error("deployment-testnet.json tidak ditemukan — jalankan server dari root proyek.");
}

function factoryAddress() {
  return deployment?.contracts?.launchpadFactory?.address || null;
}

function getReadFactory() {
  const addr = factoryAddress();
  if (!addr) return null;
  if (!readProvider) readProvider = new ethers.JsonRpcProvider(deployment.rpc || DEFAULT_RPC);
  return new ethers.Contract(addr, FACTORY_ABI, readProvider);
}

function getReadToken(tokenAddr) {
  if (!readProvider) readProvider = new ethers.JsonRpcProvider(deployment?.rpc || DEFAULT_RPC);
  return new ethers.Contract(tokenAddr, ERC20_ABI, readProvider);
}

async function connectWallet() {
  if (!window.ethereum) throw new Error("Wallet browser (MetaMask) tidak ditemukan.");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + CHAIN_ID.toString(16) }]
      });
    } catch (e) {
      if (e.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x" + CHAIN_ID.toString(16),
            chainName: "BSC Testnet",
            nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
            rpcUrls: [DEFAULT_RPC],
            blockExplorerUrls: ["https://testnet.bscscan.com"]
          }]
        });
      } else { throw e; }
    }
  }
  const signer = await provider.getSigner();
  return { provider, signer, account: await signer.getAddress() };
}

function getWriteFactory(signer) {
  const addr = factoryAddress();
  if (!addr) throw new Error("Factory belum terdeploy di testnet.");
  return new ethers.Contract(addr, FACTORY_ABI, signer);
}

function fmt(wei, decimals = 18, digits = 6) {
  const v = Number(ethers.formatUnits(wei, decimals));
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function banner(el, msg, isError = false) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.className = isError ? "banner error" : "banner";
}

function deploymentNotice(el) {
  if (!factoryAddress()) {
    banner(el, "Deployment testnet tertunda: kontrak belum terdeploy (menunggu pendanaan faucet tBNB — lihat deployment-testnet.json). Halaman ini kerangka; tombol tulis dinonaktifkan.", true);
    return true;
  }
  return false;
}
