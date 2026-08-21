# AI Studio

Internal generation + review tool for a media agency. Scripts, images and video
come in through one queue, land as immutable versions, and move through a single
approval trail. Spend is tracked per version so you always know which client
burned the budget.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 14 (App Router) | Server components keep API keys server-side |
| DB / Auth | Supabase Postgres + magic link | RLS does the access control |
| Queue | Inngest | Video renders outlive a 60s serverless timeout |
| Media store | Cloudflare R2 | No egress charge on video |
| Script | Anthropic Claude | Brand voice lives in the system prompt |
| Image / Video | fal.ai | One gateway, many models — swap without a rewrite |

## Setup

```bash
npm install
cp .env.example .env.local     # fill in the keys
npx supabase db push           # or paste the two migrations into the SQL editor
npm run dev
```

Then, in Supabase:

1. Sign in once at `/login` so a `profiles` row is created.
2. Promote yourself: `update profiles set role = 'admin' where email = 'you@agency.com';`
3. Insert a client and a project (there is no admin UI yet — that is task one).

Inngest local dev:

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

For fal webhooks locally you need a public URL. Use `ngrok http 3000` and set
`APP_URL` to the tunnel address.

## How generation flows

```
POST /api/generate
  ├─ budget check          lib/budget.ts       402 if over cap
  ├─ insert generation_job
  └─ inngest.send()
        └─ runGeneration   lib/inngest/functions.ts
              ├─ script → Claude, sync → write version
              └─ media  → fal.queue.submit(webhook)
                              └─ POST /api/webhooks/fal
                                    ├─ pull file → R2
                                    ├─ insert asset_version
                                    └─ job → succeeded
```

## Rules the code depends on

**Versions are immutable.** A DB trigger rejects any update to `storage_key`,
`params` or `asset_id`. Regenerating inserts a new row. This is what makes the
approval trail mean anything — an approved version cannot be quietly swapped.

**The render spec lives in `params`, not just the output file.** For composite
assets, store the timeline JSON so a render can be reproduced or tweaked later.
If you only keep the MP4 you cannot edit it again.

**Every version carries `cost_usd`.** Without it there is no way to answer
"which client cost us $180 last month".

**Adapters are swappable.** Video models change every few months. Add a new one
in `lib/adapters/`, register the price in `pricing.ts`, and list it in
`components/GenerateForm.tsx`. Nothing else changes.

## Cost notes

Prices in `lib/adapters/pricing.ts` are estimates for budget checks — verify them
against the live price pages. Rough shape:

- Script: ~$0.02
- Image (Flux dev): ~$0.025
- Video 5s: $0.30–1.00

Plan for 3x on video. Getting one usable clip usually takes three or four tries.

## Not built yet

Deliberately left out of the MVP so it ships:

- Client/project admin forms (insert via Supabase for now)
- Realtime job status (currently refresh; wire Supabase Realtime on `generation_jobs`)
- Composite rendering — the `composite` asset kind and `params` spec are in the
  schema, but the Remotion/FFmpeg worker is not. Add it once single-clip
  generation is solid.
- R2 lifecycle rule to expire rejected versions after 90 days. Set this in the
  Cloudflare dashboard before storage gets expensive.
