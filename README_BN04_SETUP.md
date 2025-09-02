# BN 0.4 – Setup (Cloudflare Workers + D1 + KV + R2)

## 0) Förkrav
- Node 18+
- Wrangler: `npm i -g wrangler`

## 1) Klistra in koden
Lägg hela mappträdet i din `bn-demo/`-repo som ovan.

## 2) Initiera Cloudflare resurser
I `/worker/wrangler.toml`:
- Sätt `account_id` (kör `wrangler whoami` om du är osäker).
- Skapa resurser:

```bash
cd worker

# D1
wrangler d1 create BN_DB
# KV
wrangler kv namespace create KV
# R2
wrangler r2 bucket create BN_R2
