# Deployment

## Production

- Provider: Vercel
- Project: `sort-it-out`
- Team: `alexx4`
- Production URL: https://sort-it-out-red.vercel.app

## Verified release (2026-10-08)

- Deployment URL: https://sort-it-2zf3o3rqf-alexx4.vercel.app
- Deployment ID: `dpl_5WvFu66QNVfSW17Pd5DExJ9iHdDq`
- Status: Ready
- Deployed: 2026-10-08 04:39 (Asia/Shanghai)
- Game code: commit `831eb53` (`Use reversible scrambling for later levels`); the production asset hash matched a clean local build of that commit

## Build settings

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: none

## Verification

- `npm test -- --run`: 31 tests passed
- `npm run build`: passed
- Local build emits `/assets/index-6fKuynSY.js` and `/assets/index-D9KuhMGl.css`
- `vercel inspect https://sort-it-out-red.vercel.app` resolved the production alias to deployment `dpl_5WvFu66QNVfSW17Pd5DExJ9iHdDq` at verification time
- `vercel curl https://sort-it-out-red.vercel.app/` returns HTML referencing the same JavaScript and CSS assets as the local build
- Unauthenticated requests to the production HTML and current JavaScript asset both return HTTP 200

## Notes

An already-open game tab keeps running the JavaScript it loaded when that tab opened. A deployment does not replace code in an active tab. Reload the page to get the current build; currently, a reload also discards the in-progress puzzle and starts at Level 1. Previously unlocked levels and best stars remain in local storage.

The production URL was publicly accessible without Vercel authentication when checked on 2026-10-08.

The project is linked to Vercel through `.vercel/project.json`. After a future push, check whether Vercel has already deployed it before creating a manual deployment:

```bash
npx vercel inspect https://sort-it-out-red.vercel.app
npx vercel curl https://sort-it-out-red.vercel.app/
```

If production has not updated, deploy the linked project manually:

```bash
npx vercel --prod --yes --name sort-it-out
```
