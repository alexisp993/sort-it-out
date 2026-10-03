# Deployment

## Production

- Provider: Vercel
- Project: `sort-it-out`
- Team: `alexx4`
- Production URL: https://sort-it-out-red.vercel.app
- Deployment URL: https://sort-it-ow6jh9x54-alexx4.vercel.app
- Inspector: https://vercel.com/alexx4/sort-it-out/B3yvZyrAJ9BrjapyyQcNSuVKiNQC
- Deployment ID: `dpl_B3yvZyrAJ9BrjapyyQcNSuVKiNQC`
- Status: Ready
- Deployed: 2026-10-04 (Asia/Shanghai)

## Build settings

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: none

## Verification

- `npm test`: 19 tests passed
- `npm run build`: passed
- Production HTML/assets returned successfully through `vercel curl`

## Notes

Vercel Deployment Protection is enabled on this project. The production URL may require Vercel authentication for visitors until that protection is disabled or configured for the intended audience.

To deploy a later production version from the linked project:

```bash
npx vercel --prod --yes --name sort-it-out
```
