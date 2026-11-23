# SpideyQR
Spider-Man Denim UPI QR Generator

100% client-side web app that generates custom **`1280 × 2600`** Spider-Man denim UPI lockscreen wallpapers with:

- **Embroidered Dynamic UPI ID Patch** (auto-resizes width & wraps neatly for long UPI handles)
- **Scannable Spider-Man Collector's QR Patch** (Error Correction Level H + `jsQR` scan verification before download)
- **Upload Any UPI QR Screenshot** (supports GPay, PhonePe, Paytm, BHIM, and dark-mode FamPay QRs — decoded locally)
- **Bespoke Stitched Denim Initial Patches (`A–Z`)** + **Hand-Written Sharpie Name Tag** (auto-fits 1 or 2 lines without truncating)
- **Pocket Pin Toggle** (`I ♥ PAISA` / `I ♥ MUSIC`) & **Dot-Matrix Thermal PVR • INOX `Spider-Man: BND` Ticket**
- **Background Preloading & Cache API Persistence** + **Cloudflare Pages Functions & D1 Counter**

## Local Development

```bash
npm install
npm run dev
```

## Deploy to Cloudflare Pages + D1

1. Connect this repository (`Brajesh2022/SpideyQR`) in **Cloudflare Dashboard → Workers & Pages → Create → Pages**.
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
2. Create a D1 database (`spideyqr-db`) and run the schema once:
   ```bash
   npx wrangler d1 create spideyqr-db
   npx wrangler d1 execute spideyqr-db --remote --file=./schema.sql
   ```
3. In your Cloudflare Pages project: **Settings → Functions → D1 database bindings**, add variable name **`DB`** pointing to `spideyqr-db`, then redeploy.

> *Fan-made non-commercial project. Runs 100% in your browser — UPI IDs and uploaded QRs never leave your device.*
