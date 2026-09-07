# Commission

An independent production studio for event campaigns. An agent turns a brief into creative direction, buys creative direction and artwork from Xona through Binance B402, and assembles usable campaign files.

Built for Binance Agent OS Track A, Payment Workflows. The Agent OS integration is **Binance Agentic Wallet + B402**, not the trading MCP endpoint.

## Run locally

Requires Node.js 22.12 or newer and npm. On Windows PowerShell, use npm.cmd if npm.ps1 is blocked.

```powershell
cd C:\Users\kolev\Desktop\commission
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:5173. The local API runs on port 4317. Keep the terminal running while pairing, purchasing, or producing assets.

For the built application:

```powershell
npm.cmd run build
npm.cmd start
```

Then open http://127.0.0.1:4317. Only run one API process at a time. Stop the development process first.

The current release is a **local, single-user application**. A static frontend deployment alone cannot connect to this wallet backend. Do not expose the API or its wallet session publicly.

## Connect your wallet

1. Sign in to the Binance app and open Binance Wallet. Complete wallet creation and the app's backup/setup prompts if needed.
2. In Commission, select **Connect wallet**, then **Start secure connection**.
3. Select **Open Binance pairing page**. Commission uses the exact URL returned by the official wallet CLI.
4. Scan the QR code with the Binance app. Match the pairing code shown in Commission with the app and approve.
5. Leave Commission running until its wallet status is connected. The local wallet status, rather than the app's approval screen, is the final confirmation.
6. Request a creative-direction quote. Before funding, check its full token contract, chain, amount, and recipient. The supported option in this release is **U (United Stables), BNB Chain**, contract **0xcE24439F2D9C6a2289F741120FE202248B666666**.
7. Fund the displayed Agentic Wallet address with the exact supported token on BNB Chain. An exchange balance or MCP trading sub-account is separate.
8. Request a fresh quote after funding. Review and approve its exact price inside Commission.

No Binance API keys, seed phrases, or wallet session values go into the frontend or an .env file. Session storage is handled by Binance's official CLI. Never share its ~/.baw directory.

If the pairing code expires, start a fresh pairing. Do not edit backend files during pairing in development: its file watcher restarts the service. Use the built application for the live demo.

## Campaign flow

- Open **Agent** and choose **Build my brief**, or send a field edit such as `venue: The Listening Room`. Conversation and manual edits share the same saved brief and live preview. All fields remain available behind **Edit brief**.
- Briefing uses a local guided conversation, not an additional language-model API. It supports field edits and production commands; paid AI creative direction still runs through Xona/B402.
- Review a live quote for creative direction. After approval, GPT-5.2 produces a concept, image prompt, narration, and social caption.
- Review or edit the generated direction. Commission passes the reviewed visual prompt to FLUX.2 Pro. Reviewed copy and delivered artwork complete the campaign; voiceover is optional.
- Purchase those services individually with explicit price approval.
- Download a PNG poster, PNG story, caption, and receipts in a ZIP, with narration included when selected. The animated vertical promo exports separately as **WebM**, with movement in the artwork and stationary event details. Audio is optional.
- Date, time, and venue changes reuse the purchased image. Changes to the script make the previous voiceover ineligible for new exports. Review copy after brief changes before purchasing narration or exporting the pack.

Before a purchase, the interface uses an explicitly labelled local layout preview. Preview PNG/ZIP and silent WebM exports are real files, but are **not evidence of paid AI generation**.

## Uploaded narration fallback

Open **Export > Optional voiceover**, or **Agent > Upload audio**. Upload an MP3 or WAV up to 60 seconds and 10 MB. Listen to it in the narration panel, then export the ZIP or narrated WebM. The file is saved under .commission-data/assets; its campaign association is saved in browser localStorage.

Uploaded narration is clearly labelled and makes no wallet payment. Failed provider receipts remain visible. The ZIP includes voiceover-uploaded.mp3/wav and declares its source in campaign.json and READ-ME.txt. Editing the script excludes an older recording until you replace it or confirm that it still matches. Removing narration detaches it from the campaign without deleting the local original.

Xona's speech endpoint returned a provider credit/spending-limit error during live testing on September 7. Commission disables the paid voice action when its saved records report that error. The campaign can be completed without narration. Optional uploads do not resolve or refund those earlier purchases.

## Payments and failure handling

The server requests an unsigned HTTP 402 challenge from a fixed Xona endpoint, passes the whole original challenge to the official Agentic Wallet preview command, and presents the exact supported option to the user. It signs only after the approval action.

- The initial integration supports exact U payments on BNB Chain using EIP-3009 without a token-approval transaction. Other tokens, networks, merchants, or payment methods are rejected.
- Budgets use integer token arithmetic with 18 decimals. Pending and uncertain purchases reserve their full cost.
- Purchase intent is persisted before signing. Duplicate requests reuse the existing receipt. An unresolved purchase blocks further purchases in that campaign.
- A signed request is sent once. An ambiguous network error does not trigger another payment.
- Provider responses are saved before asset parsing/download. When a response exists, **Retry saved delivery** can retry parsing/downloading it without calling the wallet or making another payment.
- Delivery and settlement are separate. A file is not labelled settled simply because it arrived. Receipt links use a transaction hash from the provider's PAYMENT-RESPONSE header or a validated B402 payment object in its response body; the app does not independently verify blockchain finality.
- If a response was lost after authorization, inspect the Binance wallet transaction history and contact the provider as necessary. This version does not automatically reconcile that case or issue refunds.

The provider's merchant address is pinned to the address verified during development. Any change requires an explicit integration review.

## Data and privacy

Briefs and editable plans live in browser localStorage. Receipts, saved provider responses, and downloaded originals live in .commission-data/ on this computer. That directory and .env files are gitignored. Keep the same browser origin when returning to a draft.

The backend binds to 127.0.0.1, validates Host/Origin, requires a local session token on mutations, and keeps signing headers out of browser responses. Asset downloads accept bounded public HTTPS responses. This is not a hosted multi-user wallet service.

## Checks

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd exec tsx scripts/check-provider.ts
```

Browser tests use installed Microsoft Edge in a separate headless profile. They cover responsive editing, draft persistence, wallet/purchase dialogs, accessibility, real PNG/ZIP/WebM exports, and explicit purchase approval using browser-only fixtures. Unit tests cover exact budgets, supported payment requirements, failed deliveries, receipt handling, and no automatic repayment.

The provider-check script sends **unsigned requests only**. On September 6, 2026, the example brief returned valid B402 challenges: 0.014823 U for direction, 0.05 U for artwork, and 0.01 U for voice. Prices are live quotes, not constants.

**Live test status:** creative direction and artwork were purchased and delivered, and the campaign was exported. Paid speech failed because of the provider credit limit; it is not a successful paid delivery. Optional uploaded narration was separately verified in ZIP and WebM exports without additional payments.

## Structure

- src/components/layout — navigation and workspace shell.
- src/components/campaign — brief editor, poster renderer, previews, and production progress.
- src/components/agent ? conversation, production actions, and settlement receipts.
- src/components/wallet — pairing and exact-price approval.
- src/lib — local drafts, API client, and lazily loaded export tools.
- shared — typed and validated campaign data.
- server — local wallet adapter, payment policy, provider transport, durable receipts, and recovery.
- tests — payment failure tests and real-browser workflow checks.

The interface uses one pure-black, neutral-charcoal, and bright-gold theme, Tailwind CSS, locally bundled Hanken Grotesk, custom line-art SVG glyphs, and custom SVG artwork. The live invitation leads the layout, above a five-step progress strip and settlement footer. The floating Agent panel handles briefing and production; settled purchases appear as inline receipts. A CSS-only assembly sequence respects reduced-motion preferences and does not affect exported files. Preview artwork is code-generated; paid artwork comes from the selected provider.

## Integration references

- [Official Binance Agentic Wallet skill and references](https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3/binance-agentic-wallet)
- [Binance B402 Bazaar](https://developers.binance.com/en/docs/products/onchainpay-x402/b402-bazaar)
- [Xona resource schemas](https://api.xona-agent.com/x402-resources)
- [Xona BNB Chain support](https://xona-agent.com/blog/xona-ai-resources-multi-network-bnb-chain)
- [Frontend design skill consulted](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

Hackathon submission still requires a real demo video and a public GitHub link. This working directory has not been published or submitted.
