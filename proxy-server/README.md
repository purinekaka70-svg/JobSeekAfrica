# Careerjet Fixed-IP Proxy

This proxy runs on a server with a static IP so Careerjet always sees the same IP.

## Setup
1. Provision a small VPS with a static public IP.
2. Install Node.js 18+.
3. Copy this folder to the server.
4. Create `.env` from `.env.example` and set `CAREERJET_API_KEY`.
5. Install dependencies and start the server:

```bash
npm install
npm start
```

## Fly.io (static egress IP)
1. Deploy this folder to Fly (`fly launch`).
2. Set the API key secret: `fly secrets set CAREERJET_API_KEY=...`.
3. Allocate a static egress IP for your region: `fly ips allocate-egress --app <app-name> -r <region>`.
4. Run `fly ips list` and allowlist the egress IP in Careerjet.
5. Set the frontend proxy endpoint to `https://<app-name>.fly.dev/careerjet`.

If you run the proxy in multiple regions, allocate an egress IP per region.

## Endpoints
- `GET /health`
- `GET /careerjet?q=developer&location=Nairobi&page=1&pageSize=50`

## CORS
By default, `CORS_ORIGIN` is `*`. For production, set it to your site domain.

## Use in the frontend
Set this in `env.js` or your injected `window.__ENV__`:

```
CAREERJET_PROXY_ENDPOINT: "https://YOUR_PROXY_DOMAIN/careerjet"
```

Redeploy the site after changing the endpoint.
