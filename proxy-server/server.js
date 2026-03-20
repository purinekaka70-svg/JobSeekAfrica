import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 8080);
const CAREERJET_API_URL = "https://search.api.careerjet.net/v4/query";

app.set("trust proxy", true);

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    if (first) return first.replace(/^::ffff:/, "");
  }
  if (req.ip) return String(req.ip).replace(/^::ffff:/, "");
  return req.socket?.remoteAddress || "127.0.0.1";
}

function getRefererUrl(req) {
  if (req.query?.url) return String(req.query.url);
  if (req.headers.referer) return req.headers.referer;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}/jobs.html`;
}

function setCors(res) {
  const allowed = (process.env.CORS_ORIGIN || "*").trim();
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

app.options("/careerjet", (req, res) => {
  setCors(res);
  res.status(204).end();
});

app.get("/health", (req, res) => {
  setCors(res);
  res.json({ ok: true });
});

app.get("/careerjet", async (req, res) => {
  setCors(res);

  const apiKey = (process.env.CAREERJET_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(500).json({ error: "Missing CAREERJET_API_KEY" });
  }

  const q = String(req.query.q || "");
  const location = String(req.query.location || "");
  const page = String(req.query.page || "1");
  const pageSize = String(req.query.pageSize || "50");

  const refererUrl = getRefererUrl(req);
  const userIp = getClientIp(req);
  const userAgent = req.headers["user-agent"] || "JobSeekAfrica/1.0";

  const params = new URLSearchParams({
    locale_code: "en_KE",
    page,
    pagesize: pageSize,
    sort: "date",
    user_ip: userIp,
    user_agent: userAgent,
    url: refererUrl
  });

  if (q) params.set("keywords", q);
  if (location) params.set("location", location);

  const endpoint = `${CAREERJET_API_URL}?${params.toString()}`;
  const authString = Buffer.from(`${apiKey}:`).toString("base64");

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Basic ${authString}`,
        Referer: refererUrl
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Careerjet API error",
        details: text
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Proxy failed", details: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Careerjet proxy running on port ${PORT}`);
});
