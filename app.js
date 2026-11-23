/* Padhaus — multi-chain front end.
 * Network configuration lives in chains.js (PADHAUS_CHAINS): chainId ->
 * { name, rpcUrl, factoryAddress, nativeSymbol, explorerUrl, testnet }.
 * Reads go through the active chain's public RPC; writes go through the
 * browser wallet (MetaMask), pointed at the active chain.
 * The active chain is picked in the #chainSwitcher dropdown in the header,
 * stored in localStorage, and can be forced with the URL parameter
 * ?chain=<chainId>.
 * A chain whose factoryAddress is null = not deployed yet: the UI marks it
 * "not deployed yet" and disables all write actions.
 * BSC Testnet only: deployment-testnet.json (the deploy script's output) is
 * still read, and its factory address is used as an override when that
 * file's chainId matches the active chain.
 */
const FACTORY_ABI = [
  "function tokenCount() view returns (uint256)",
  "function allTokens(uint256) view returns (address)",
  "function getCurve(address) view returns (tuple(address creator, string metadataURI, uint256 virtualQuote, uint256 virtualToken, uint256 realQuote, uint256 tokensSold, bool graduated, uint256 feeBpsSnapshot, uint256 graduationFeeBpsSnapshot))",
  "function spotPrice(address) view returns (uint256)",
  "function quoteBuy(address, uint256) view returns (uint256 tokensOut, uint256 fee)",
  "function quoteSell(address, uint256) view returns (uint256 netOut, uint256 fee)",
  "function creatorFees(address) view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function createToken(string name_, string symbol_, string metadataURI, uint256 feeBps_) returns (address)",
  "function buy(address token, uint256 minTokensOut) payable",
  "function sell(address token, uint256 tokenAmount, uint256 minQuoteOut)",
  "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, string metadataURI)",
  "event Buy(address indexed token, address indexed buyer, uint256 quoteInNet, uint256 fee, uint256 tokensOut)",
  "event Sell(address indexed token, address indexed seller, uint256 tokensIn, uint256 quoteOutGross, uint256 fee, uint256 quoteOutNet)",
  "event Graduated(address indexed token, uint256 quoteToLP, uint256 tokensToLP, uint256 liquidity, address lpTo)"
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

/* ---------- Active chain ---------- */

function resolveInitialChainId() {
  const fromUrl = new URLSearchParams(location.search).get("chain");
  if (fromUrl && PADHAUS_CHAINS[Number(fromUrl)]) return Number(fromUrl);
  try {
    const saved = Number(localStorage.getItem("padhaus.chainId"));
    if (saved && PADHAUS_CHAINS[saved]) return saved;
  } catch (_) { /* localStorage unavailable */ }
  return PADHAUS_DEFAULT_CHAIN_ID;
}

let activeChainId = resolveInitialChainId();
let deployment = null; // contents of deployment-testnet.json (override for the matching chain only)
const readProviders = new Map(); // chainId -> ethers.JsonRpcProvider

function getActiveChainId() { return activeChainId; }

function getChain(chainId) {
  return PADHAUS_CHAINS[chainId ?? activeChainId] || null;
}

function nativeSymbol() { return getChain().nativeSymbol; }

/* Factory address for ANY chain (used by the grouped homepage discovery).
 * The deployment-file override applies only to the chain it belongs to. */
function factoryAddressFor(chainId) {
  if (deployment && Number(deployment.chainId) === chainId) {
    const fromFile = deployment.contracts?.launchpadFactory?.address;
    if (fromFile) return fromFile;
  }
  const cfg = getChain(chainId);
  return (cfg && cfg.factoryAddress) || null;
}

function factoryAddress() { return factoryAddressFor(activeChainId); }

function isDeployed() { return !!factoryAddress(); }

/* Read deployment-testnet.json if present (compatibility with the older
 * deploy flow). Not fatal if the file is missing — the chains.js config
 * is enough on its own. */
async function loadDeployment() {
  const candidates = ["../deployment-testnet.json", "./deployment-testnet.json", "../../deployment-testnet.json"];
  for (const path of candidates) {
    try {
      const res = await fetch(path);
      if (res.ok) { deployment = await res.json(); return deployment; }
    } catch (_) { /* try the next path */ }
  }
  deployment = null;
  return null;
}

function getReadProviderFor(chainId) {
  const cfg = getChain(chainId);
  if (!cfg || !cfg.rpcUrl) return null; // chain has no public RPC yet (e.g. Zero before mainnet)
  if (!readProviders.has(chainId)) {
    readProviders.set(chainId, new ethers.JsonRpcProvider(cfg.rpcUrl));
  }
  return readProviders.get(chainId);
}

function getReadProvider() { return getReadProviderFor(activeChainId); }

function getReadFactoryFor(chainId) {
  const addr = factoryAddressFor(chainId);
  if (!addr) return null;
  return new ethers.Contract(addr, FACTORY_ABI, getReadProviderFor(chainId));
}

function getReadFactory() { return getReadFactoryFor(activeChainId); }

function getReadTokenFor(tokenAddr, chainId) {
  return new ethers.Contract(tokenAddr, ERC20_ABI, getReadProviderFor(chainId));
}

function getReadToken(tokenAddr) { return getReadTokenFor(tokenAddr, activeChainId); }

/* Ask the wallet to switch to a given chain; if the wallet does not know
 * the chain yet, offer to add it from the chains.js configuration. */
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
  if (!window.ethereum) throw new Error("Browser wallet (MetaMask) not found.");
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
  if (!addr) throw new Error("Factory is not deployed yet on " + getChain().name + ".");
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

/* If the active chain is not deployed yet, show a notice and return
 * true — the calling page must disable its write buttons. */
function deploymentNotice(el) {
  if (!isDeployed()) {
    const cfg = getChain();
    banner(el, "Padhaus is not deployed yet on " + cfg.name + " (chain " + cfg.chainId + ") — " +
      "this network is a preset only. The token list and launch/trade actions are disabled for this chain.", true);
    return true;
  }
  return false;
}

/* ---------- Network switcher (header) ---------- */

function chainBadgeText() {
  const cfg = getChain();
  if (!isDeployed()) return cfg.name + " · chain " + cfg.chainId + " — not deployed yet";
  return (cfg.testnet ? "Prototype — " : "") + cfg.name + " · chain " + cfg.chainId;
}

async function onChainSelected(newChainId) {
  try { localStorage.setItem("padhaus.chainId", String(newChainId)); } catch (_) { /* ignore */ }
  // If a wallet is already connected, ask it to switch networks too.
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts && accounts.length > 0) await ensureWalletChain(newChainId);
    } catch (_) { /* a silent wallet rejection is not fatal; connectWallet() will retry the request */ }
  }
  // Rebuild the page from the new chain's configuration. The token page is
  // chain-specific (a token address means nothing across chains), so from
  // there, route to the target chain's token list instead.
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

/* ---------- Small helpers ---------- */

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function timeAgo(tsSeconds) {
  if (!tsSeconds) return "—";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - tsSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

/* ---------- Token metadata (IPFS) ---------- */

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
const tokenMetadataCache = new Map(); // token address (lowercase) -> Promise<meta|null>

function ipfsToHttp(uri) {
  if (!uri) return null;
  const u = String(uri).trim();
  if (u.startsWith("ipfs://")) return IPFS_GATEWAY + u.slice("ipfs://".length);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return null;
}

/* A metadata field that must be a plain web link (project website / X /
 * Telegram): only http(s) URLs are accepted, anything else (including
 * javascript: or data: values planted in third-party metadata) is dropped
 * so it can never reach an href. Returns null for absent/invalid values. */
function metaHttpUrl(value) {
  if (typeof value !== "string") return null;
  const u = value.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return null;
}

/* Resolve a token's metadataURI to
 * { name, symbol, description, image, website, twitter, telegram }.
 * ipfs:// URIs are fetched through the public gateway; https:// URIs are
 * fetched directly. Returns null on any failure — callers fall back to the
 * on-chain name/symbol and a letter placeholder. Results (including
 * failures) are cached per token address for the page lifetime, so a slow
 * or dead metadata URI can never break or block rendering. */
function resolveTokenMetadata(tokenAddr, metadataURI) {
  // Keyed by address + URI: the same address on another chain is a
  // different token, but its metadata is fully determined by the URI.
  const key = String(tokenAddr).toLowerCase() + "|" + String(metadataURI || "");
  if (tokenMetadataCache.has(key)) return tokenMetadataCache.get(key);
  const promise = (async () => {
    const url = ipfsToHttp(metadataURI);
    if (!url) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || typeof data !== "object") return null;
      return {
        name: typeof data.name === "string" ? data.name : null,
        symbol: typeof data.symbol === "string" ? data.symbol : null,
        description: typeof data.description === "string" ? data.description : null,
        image: ipfsToHttp(data.image),
        website: metaHttpUrl(data.website) || metaHttpUrl(data.external_url),
        twitter: metaHttpUrl(data.twitter),
        telegram: metaHttpUrl(data.telegram)
      };
    } catch (_) { return null; }
  })();
  tokenMetadataCache.set(key, promise);
  return promise;
}

/* Placeholder logo: a disc with the token symbol's first letter. */
function tokenLogoPlaceholderHtml(symbol) {
  const letter = (String(symbol || "?").trim().charAt(0) || "?").toUpperCase();
  return '<span class="token-logo token-logo-placeholder">' + esc(letter) + "</span>";
}

/* Project links from resolved metadata, as [{ label, url }] in display
 * order. Empty when the metadata carries no usable links. */
function tokenLinks(meta) {
  if (!meta) return [];
  const links = [];
  if (meta.website) links.push({ label: "Website", url: meta.website });
  if (meta.twitter) links.push({ label: "X", url: meta.twitter });
  if (meta.telegram) links.push({ label: "Telegram", url: meta.telegram });
  return links;
}

/* The links as one labeled, external-link row ("" when there are none),
 * shared by the token page and the homepage cards. */
function tokenLinksHtml(meta) {
  const links = tokenLinks(meta);
  if (!links.length) return "";
  return '<span class="token-links">' + links.map((l) =>
    '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + l.label + "</a>"
  ).join(" · ") + "</span>";
}

/* ---------- Token image upload (relay) ----------
 * The front end never talks to Pinata directly (that would expose the
 * API key). Instead it POSTs files to a tiny serverless relay (see the
 * upload-relay/ folder in the project root) which pins them to IPFS and
 * returns { cid }. Set PADHAUS_UPLOAD_ENDPOINT to the deployed relay URL
 * including the /api/pin path, e.g.
 *   "https://padhaus-upload.vercel.app/api/pin"
 * While it is empty, image upload is disabled in the launch form and
 * launching without an image works exactly as before. */
const PADHAUS_UPLOAD_ENDPOINT = "";

function uploadConfigured() { return !!PADHAUS_UPLOAD_ENDPOINT; }

/* POSTs one file (File or Blob) to the relay and resolves with its IPFS
 * CID. Throws an Error with a user-readable message on any failure. */
async function uploadFileToRelay(file, filename) {
  if (!uploadConfigured()) throw new Error("Image upload is not configured yet.");
  const form = new FormData();
  form.append("file", file, filename || file.name || "upload");
  let res;
  try {
    res = await fetch(PADHAUS_UPLOAD_ENDPOINT, { method: "POST", body: form });
  } catch (_) {
    throw new Error("Could not reach the upload service. Launch aborted — please try again.");
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON error body */ }
  if (!res.ok || !data || !data.cid) {
    throw new Error((data && data.error) || ("Upload failed (HTTP " + res.status + "). Launch aborted."));
  }
  return data.cid;
}

/* ---------- Launch-form link normalization ----------
 * The Website / X / Telegram fields accept full URLs; X and Telegram
 * also accept bare handles ("name" or "@name"). Each helper returns ""
 * for empty input, the normalized https:// URL on success, and throws an
 * Error with a user-readable message on invalid input — the launch form
 * treats a throw as "abort the submit", exactly like an upload failure. */

function normalizeWebsiteUrl(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  let parsed;
  try {
    // A bare domain ("example.com") is read as https://example.com.
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v);
  } catch (_) {
    throw new Error("Website must be a valid http(s) URL, e.g. https://example.com.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Website must be a valid http(s) URL, e.g. https://example.com.");
  }
  return parsed.href;
}

/* Extracts the handle from an x.com / twitter.com URL, or null when the
 * value is not a URL on one of those hosts. */
function handleFromSocialUrl(v, hosts) {
  if (!/^https?:\/\//i.test(v)) return null;
  let parsed;
  try { parsed = new URL(v); } catch (_) { return null; }
  if (!hosts.includes(parsed.hostname.toLowerCase())) return null;
  const segment = parsed.pathname.split("/").filter(Boolean)[0] || "";
  return decodeURIComponent(segment);
}

function normalizeXUrl(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const fromUrl = handleFromSocialUrl(v, ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);
  const handle = (fromUrl !== null ? fromUrl : v).replace(/^@+/, "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    throw new Error("X (Twitter) must be a handle like @name or a URL like https://x.com/name.");
  }
  return "https://x.com/" + handle;
}

function normalizeTelegramUrl(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) {
    let parsed;
    try { parsed = new URL(v); } catch (_) { parsed = null; }
    if (parsed && ["t.me", "www.t.me", "telegram.me", "www.telegram.me"].includes(parsed.hostname.toLowerCase())) {
      const segment = parsed.pathname.split("/").filter(Boolean)[0] || "";
      // Public invite links (t.me/+… and t.me/joinchat/…) have no handle;
      // they are already full URLs, so keep them as entered.
      if (segment.startsWith("+") || segment.toLowerCase() === "joinchat") return parsed.href;
      const handle = decodeURIComponent(segment).replace(/^@+/, "");
      if (!/^[A-Za-z0-9_]{5,32}$/.test(handle)) {
        throw new Error("Telegram must be a handle like @name or a URL like https://t.me/name.");
      }
      return "https://t.me/" + handle;
    }
    throw new Error("Telegram must be a handle like @name or a URL like https://t.me/name.");
  }
  const handle = v.replace(/^@+/, "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(handle)) {
    throw new Error("Telegram must be a handle like @name or a URL like https://t.me/name.");
  }
  return "https://t.me/" + handle;
}

/* Builds the launch metadata JSON from whichever optional inputs are
 * present (image, description, website, twitter, telegram), uploads the
 * image first when one is chosen, then uploads the JSON itself, and
 * returns the metadata's ipfs:// URI for createToken. Links are
 * validated/normalized before anything is uploaded, so an invalid entry
 * aborts the launch without wasting an upload. Empty fields are omitted
 * from the JSON. Throws on any failure — the caller must abort the
 * launch rather than submit a broken URI. Shape:
 * { name, symbol, description?, image?, website?, external_url?,
 *   twitter?, telegram? } — external_url mirrors website, following the
 * common NFT-metadata convention. */
async function buildMetadataURI({ name, symbol, description, imageFile, website, twitter, telegram }) {
  const site = normalizeWebsiteUrl(website);
  const xUrl = normalizeXUrl(twitter);
  const tgUrl = normalizeTelegramUrl(telegram);
  const metadata = { name, symbol };
  if (description) metadata.description = description;
  if (imageFile) {
    const imageCid = await uploadFileToRelay(imageFile);
    metadata.image = "ipfs://" + imageCid;
  }
  if (site) { metadata.website = site; metadata.external_url = site; }
  if (xUrl) metadata.twitter = xUrl;
  if (tgUrl) metadata.telegram = tgUrl;
  const blob = new Blob([JSON.stringify(metadata)], { type: "application/json" });
  const metadataCid = await uploadFileToRelay(blob, "metadata.json");
  return "ipfs://" + metadataCid;
}

/* Backwards-compatible alias: the image-only entry point. */
async function buildImageMetadataURI(args) {
  return buildMetadataURI(args);
}

/* ---------- Discovery: factory event scanning ----------
 * Scans TokenCreated / Buy / Sell logs from the active chain's RPC in
 * 2000-block chunks, starting at the factory deployment block when it is
 * known (the deploy tx recorded in the deployment file), otherwise the
 * most recent FALLBACK_SCAN_BLOCKS blocks. Per token it aggregates:
 * creation block/time, lifetime native volume (Buy: quoteInNet + fee,
 * i.e. the gross native amount paid in; Sell: quoteOutGross), trade
 * count, and last activity block/time. Aggregates are cached in
 * localStorage keyed by chainId + factory address, so repeat visits only
 * scan blocks added since the last visit. Any failure keeps whatever was
 * scanned so far and the UI simply keeps showing "—" for the missing
 * fields — the token list itself never waits on this scan. */

const SCAN_CHUNK_BLOCKS = 2000;
const FALLBACK_SCAN_BLOCKS = 100000;

function scanCacheKeyFor(chainId) {
  return "padhaus.scan.v1." + chainId + "." + (factoryAddressFor(chainId) || "").toLowerCase();
}

function loadScanCacheFor(chainId) {
  try {
    const raw = localStorage.getItem(scanCacheKeyFor(chainId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.lastBlock !== "number" || !parsed.tokens) return null;
    return parsed;
  } catch (_) { return null; }
}

function saveScanCacheFor(chainId, cache) {
  try { localStorage.setItem(scanCacheKeyFor(chainId), JSON.stringify(cache)); } catch (_) { /* storage full or unavailable */ }
}

async function resolveScanStartBlockFor(provider, chainId, latest) {
  // Preferred: the block the factory was deployed in, from the deploy tx
  // recorded in the deployment file (only when it belongs to this chain).
  if (deployment && Number(deployment.chainId) === chainId) {
    const deployTx = deployment.contracts?.launchpadFactory?.deployTx;
    if (deployTx) {
      try {
        const receipt = await provider.getTransactionReceipt(deployTx);
        if (receipt) return receipt.blockNumber;
      } catch (_) { /* fall through to the window fallback */ }
    }
  }
  return Math.max(0, latest - FALLBACK_SCAN_BLOCKS);
}

/* Runs the scan for one chain and calls onUpdate(cache) once at the end
 * (or with the cached data immediately when there is nothing new). */
async function scanFactoryEventsFor(chainId, onUpdate) {
  const provider = getReadProviderFor(chainId);
  const fAddr = factoryAddressFor(chainId);
  if (!provider || !fAddr) return null;
  const iface = new ethers.Interface(FACTORY_ABI);
  const topics = [[
    iface.getEvent("TokenCreated").topicHash,
    iface.getEvent("Buy").topicHash,
    iface.getEvent("Sell").topicHash
  ]];
  const latest = await provider.getBlockNumber();
  let cache = loadScanCacheFor(chainId);
  if (!cache) {
    const startBlock = await resolveScanStartBlockFor(provider, chainId, latest);
    cache = { startBlock, lastBlock: startBlock - 1, tokens: {}, blockTimes: {} };
  }
  for (let from = cache.lastBlock + 1; from <= latest; from += SCAN_CHUNK_BLOCKS) {
    const to = Math.min(from + SCAN_CHUNK_BLOCKS - 1, latest);
    let logs;
    try {
      logs = await provider.getLogs({ address: fAddr, topics, fromBlock: from, toBlock: to });
    } catch (_) {
      break; // keep the last good chunk boundary in the cache
    }
    for (const log of logs) {
      let parsed;
      try { parsed = iface.parseLog({ topics: log.topics, data: log.data }); } catch (_) { continue; }
      if (!parsed) continue;
      const tokenKey = String(parsed.args.token).toLowerCase();
      const agg = cache.tokens[tokenKey] || (cache.tokens[tokenKey] = {
        createdBlock: null, createdAt: null, volumeWei: "0", trades: 0, lastBlock: null, lastAt: null
      });
      if (parsed.name === "TokenCreated") {
        if (agg.createdBlock === null || log.blockNumber < agg.createdBlock) agg.createdBlock = log.blockNumber;
      } else if (parsed.name === "Buy" || parsed.name === "Sell") {
        const amount = parsed.name === "Buy"
          ? parsed.args.quoteInNet + parsed.args.fee
          : parsed.args.quoteOutGross;
        agg.volumeWei = (BigInt(agg.volumeWei) + amount).toString();
        agg.trades += 1;
        if (agg.lastBlock === null || log.blockNumber > agg.lastBlock) agg.lastBlock = log.blockNumber;
      }
    }
    cache.lastBlock = to;
    saveScanCacheFor(chainId, cache);
  }
  // Resolve timestamps for the creation / last-activity blocks we track.
  const needBlocks = new Set();
  for (const agg of Object.values(cache.tokens)) {
    if (agg.createdBlock !== null && agg.createdAt === null) needBlocks.add(agg.createdBlock);
    if (agg.lastBlock !== null && agg.lastAt === null) needBlocks.add(agg.lastBlock);
  }
  for (const bn of needBlocks) {
    if (cache.blockTimes[bn] === undefined) {
      try {
        const block = await provider.getBlock(bn);
        if (block) cache.blockTimes[bn] = block.timestamp;
      } catch (_) { /* leave unresolved; the UI shows "—" */ }
    }
  }
  for (const agg of Object.values(cache.tokens)) {
    if (agg.createdBlock !== null && cache.blockTimes[agg.createdBlock]) agg.createdAt = cache.blockTimes[agg.createdBlock];
    if (agg.lastBlock !== null && cache.blockTimes[agg.lastBlock]) agg.lastAt = cache.blockTimes[agg.lastBlock];
  }
  saveScanCacheFor(chainId, cache);
  if (onUpdate) onUpdate(cache);
  return cache;
}

/* Scan for the currently active chain (single-chain pages). */
async function scanFactoryEvents(onUpdate) {
  return scanFactoryEventsFor(activeChainId, onUpdate);
}
