# Universaarl Project Twin

Read-only visualization of the external Universaarl BC Blueprint. The Twin owns only adapters, the normalized and Zod-validated read model, UI, replay visualization, tests and its software OpenSpec. Blueprint truth remains external and is referenced by stable `UABC-*` IDs.

## Source contract

The Node boundary reads only `architecture/`, `capabilities/`, `openspec/`, `atlassian/jira/`, `atlassian/confluence/` and curated PNG files plus the verification register below `evidence/`. Authentication state, tenant/token/secret material, traces and videos are excluded. The browser receives no absolute source path. There is no write route.

## Run

1. Copy `.env.example` to ignored `.env.local` and set the absolute `UABC_SOURCE_REPO` path.
2. Run `npm install`.
3. Run `npm run check`.
4. Run `npm run dev` and open `http://127.0.0.1:4173`.

Local source paths, generated build output, browser traces, videos and authentication state remain ignored.
