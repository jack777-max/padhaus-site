/* Padhaus — front-end multi-chain.
 * Konfigurasi jaringan hidup di chains.js (PADHAUS_CHAINS): chainId ->
 * { name, rpcUrl, factoryAddress, nativeSymbol, explorerUrl, testnet }.
 * Baca (read) lewat RPC publik chain aktif; tulis (write) lewat wallet
 * browser (MetaMask) yang diarahkan ke chain aktif.
 * Chain aktif dipilih lewat dropdown #chainSwitcher di header, disimpan di
 * localStorage, dan bisa dipaksa lewat parameter URL ?chain=<chainId>.
 * Chain yang factoryAddress-nya null = belum terdeploy: UI menandainya
 * "not deployed yet" dan menonaktifkan semua aksi tulis.
 * Khusus chain BSC Testnet: deployment-testnet.json (hasil script deploy)
 * tetap dibaca dan alamat factory-nya dipakai sebagai override bila
 * chainId file itu cocok dengan chain aktif.
 */
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

/* ---------- Chain aktif ---------- */

function resolveInitialChainId() {
  const fromUrl = new URLSearchParams(location.search).get("chain");
  if (fromUrl && PADHAUS_CHAINS[Number(fromUrl)]) return Number(fromUrl);
  try {
    const saved = Number(localStorage.getItem("padhaus.chainId"));
    if (saved && PADHAUS_CHAINS[saved]) return saved;
  } catch (_) { /* localStorage tidak tersedia */ }
  return PADHAUS_DEFAULT_CHAIN_ID;
}

let activeChainId = resolveInitialChainId();
let deployment = null; // isi deployment-testnet.json (override khusus chain yang cocok)
let readProvider = null;
let readProviderChainId = null;

function getActiveChainId() { return activeChainId; }

function getChain(chainId) {
  return PADHAUS_CHAINS[chainId ?? activeChainId] || null;
}

function nativeSymbol() { return getChain().nativeSymbol; }

function factoryAddress() {
  if (deployment && Number(deployment.chainId) === activeChainId) {
    const fromFile = deployment.contracts?.launchpadFactory?.address;
    if (fromFile) return fromFile;
  }
  return getChain().factoryAddress || null;
}

function isDeployed() { return !!factoryAddress(); }

/* Baca deployment-testnet.json bila ada (kompatibilitas alur deploy lama).
 * Tidak fatal bila file tidak ada — konfigurasi chains.js sudah cukup. */
async function loadDeployment() {
  const candidates = ["../deployment-testnet.json", "./deployment-testnet.json", "../../deployment-testnet.json"];
  for (const path of candidates) {
    try {
      const res = await fetch(path);
      if (res.ok) { deployment = await res.json(); return deployment; }
    } catch (_) { /* coba path berikutnya */ }
  }
  deployment = null;
  return null;
}

function getReadProvider() {
  if (!getChain().rpcUrl) return null; // chain belum punya RPC publik (mis. Zero sebelum mainnet)
  if (!readProvider || readProviderChainId !== activeChainId) {
    readProvider = new ethers.JsonRpcProvider(getChain().rpcUrl);
    readProviderChainId = activeChainId;
  }
  return readProvider;
}

function getReadFactory() {
  const addr = factoryAddress();
  if (!addr) return null;
  return new ethers.Contract(addr, FACTORY_ABI, getReadProvider());
}

function getReadToken(tokenAddr) {
  return new ethers.Contract(tokenAddr, ERC20_ABI, getReadProvider());
}

/* Minta wallet pindah ke chain tertentu; bila chain belum dikenal wallet,
 * tawarkan untuk menambahkannya dari konfigurasi chains.js. */
async function ensureWalletChain(chainId) {
  const cfg = getChain(chainId);
  const hexId = "0x" + chainId.toString(16);
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }]
    });
  } catch (e) {
    if (e.code === 4902) {
      const params = {
        chainId: hexId,
        chainName: cfg.name,
        nativeCurrency: { name: cfg.nativeName, symbol: cfg.nativeSymbol, decimals: 18 },
        rpcUrls: [cfg.rpcUrl]
      };
      if (cfg.explorerUrl) params.blockExplorerUrls = [cfg.explorerUrl];
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [params] });
    } else { throw e; }
  }
}

async function connectWallet() {
  if (!window.ethereum) throw new Error("Wallet browser (MetaMask) tidak ditemukan.");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== activeChainId) {
    await ensureWalletChain(activeChainId);
  }
  const signer = await provider.getSigner();
  return { provider, signer, account: await signer.getAddress() };
}

function getWriteFactory(signer) {
  const addr = factoryAddress();
  if (!addr) throw new Error("Factory belum terdeploy di " + getChain().name + ".");
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

/* Bila chain aktif belum terdeploy, tampilkan pemberitahuan dan kembalikan
 * true — halaman pemanggil wajib menonaktifkan tombol tulisnya. */
function deploymentNotice(el) {
  if (!isDeployed()) {
    const cfg = getChain();
    banner(el, "Padhaus belum terdeploy di " + cfg.name + " (chain " + cfg.chainId + ") — " +
      "jaringan ini preset saja. Daftar token dan aksi launch/trade dinonaktifkan untuk chain ini.", true);
    return true;
  }
  return false;
}

/* ---------- Pemilih jaringan (header) ---------- */

function chainBadgeText() {
  const cfg = getChain();
  if (!isDeployed()) return cfg.name + " · chain " + cfg.chainId + " — not deployed yet";
  return (cfg.testnet ? "Prototype — " : "") + cfg.name + " · chain " + cfg.chainId;
}

async function onChainSelected(newChainId) {
  try { localStorage.setItem("padhaus.chainId", String(newChainId)); } catch (_) { /* abaikan */ }
  // Bila ada wallet yang sudah terhubung, minta wallet ikut pindah jaringan.
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts && accounts.length > 0) await ensureWalletChain(newChainId);
    } catch (_) { /* wallet menolak diam-diam tidak fatal; connectWallet() akan mengulang permintaan */ }
  }
  // Bangun ulang halaman dari konfigurasi chain baru. Halaman token bersifat
  // khusus-chain (alamat token tidak berlaku lintas chain), jadi dari sana
  // pindah ke daftar token chain tujuan.
  const onTokenPage = location.pathname.endsWith("token.html");
  const target = new URL(onTokenPage ? "index.html" : location.pathname, location.href);
  target.search = "?chain=" + newChainId;
  location.href = target.toString();
}

function initChainUI() {
  const select = document.getElementById("chainSwitcher");
  if (select) {
    select.innerHTML = "";
    for (const id of PADHAUS_CHAIN_ORDER) {
      const cfg = PADHAUS_CHAINS[id];
      if (!cfg) continue;
      const opt = document.createElement("option");
      opt.value = String(id);
      opt.textContent = cfg.name + (cfg.factoryAddress ? "" : " (not deployed yet)");
      select.appendChild(opt);
    }
    select.value = String(activeChainId);
    select.onchange = () => { onChainSelected(Number(select.value)); };
  }
  const badgeText = chainBadgeText();
  document.querySelectorAll(".chain-badge").forEach((el) => { el.textContent = badgeText; });
  document.querySelectorAll("[data-chain-name]").forEach((el) => { el.textContent = getChain().name; });
  document.querySelectorAll("[data-native-symbol]").forEach((el) => { el.textContent = nativeSymbol(); });
  document.querySelectorAll("[data-chain-hero]").forEach((el) => {
    el.textContent = getChain().testnet ? "Prototype — " + getChain().name : getChain().name;
  });
}

document.addEventListener("DOMContentLoaded", initChainUI);
