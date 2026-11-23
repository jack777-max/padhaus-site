# Padhaus — fair-launch launchpad (website)

Static website for **Padhaus**, a fair-launch launchpad:

- **Free to launch** — no launch fee, gas only.
- **Deployer-chosen trade fee** — 0–5% at launch, split 50/50 creator / platform.
- **Fees frozen per token at launch** — never changed unilaterally.
- **Graduation fee 2%** — tokens graduate from the bonding curve to a DEX pool.

## Status: testnet prototype

This site is a **prototype running on BSC Testnet (chain 97)**. It reads the
LaunchpadFactory contract live from `deployment-testnet.json` and talks to it
through `app.js` (ethers.js). Testnet tokens shown here have no real-world value.

Pages:

- `index.html` — landing + live token list
- `launch.html` — launch a token (MetaMask on BSC Testnet)
- `token.html` — token detail + buy/sell on the bonding curve

Served via GitHub Pages at https://padhaus.fun (custom domain; DNS at Hostinger).
