// api/fetchJobs.js
// Uses the global fetch available in modern Node runtimes (18+).

import { createHash } from "crypto";
import { getAdminDb, FieldValue } from "./_firebaseAdmin.js";

const CAREERJET_API_URL = "https://search.api.careerjet.net/v4/query";

const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa",
  "Homa Bay","Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga",
  "Kisii","Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera",
  "Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok",
  "Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River",
  "Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
];
const COUNTY_ALIASES = {
  "nairobi": "Nairobi",
  "mombasa": "Mombasa",
  "kisumu": "Kisumu",
  "nakuru": "Nakuru",
  "eldoret": "Uasin Gishu",
  "thika": "Kiambu",
  "ruiru": "Kiambu",
  "juja": "Kiambu",
  "kitale": "Trans Nzoia",
  "malindi": "Kilifi",
  "diani": "Kwale",
  "voi": "Taita-Taveta",
  "taveta": "Taita-Taveta",
  "nyahururu": "Laikipia",
  "nanyuki": "Laikipia"
};

const CAREERJET_LOCALE = (process.env.CAREERJET_LOCALE || "en_KE").trim();
const CAREERJET_USER_AGENT_FALLBACK = (process.env.CAREERJET_USER_AGENT || "JobSeekAfrica/1.0").trim();
const JOBS_PAGES = Math.min(5, Math.max(1, Number(process.env.JOBS_PAGES || 3)));
const JOBS_RESULTS_PER_PAGE = Math.min(
  50,
  Math.max(10, Number(process.env.JOBS_RESULTS_PER_PAGE || 30))
);

const CAREERJET_CACHE_TTL_MINUTES = Math.max(
  0,
  Number(process.env.CAREERJET_CACHE_TTL_MINUTES || 360)
);
const CAREERJET_CACHE_ENABLED =
  String(process.env.CAREERJET_CACHE_ENABLED || "true").toLowerCase() === "true";
const CAREERJET_CACHE_COLLECTION = (process.env.CAREERJET_CACHE_COLLECTION || "careerjet_cache").trim();
const CAREERJET_ALLOW_STALE_CACHE =
  String(process.env.CAREERJET_ALLOW_STALE_CACHE || "true").toLowerCase() === "true";
const CAREERJET_DEBUG =
  String(process.env.CAREERJET_DEBUG || "true").toLowerCase() === "true"; // always true for debug
const CAREERJET_STORE_JOBS =
  String(
    process.env.CAREERJET_STORE_JOBS ??
      (process.env.FIREBASE_SERVICE_ACCOUNT ? "true" : "false")
  ).toLowerCase() === "true";
const CAREERJET_STORE_COLLECTION = (process.env.CAREERJET_STORE_COLLECTION || "jobs").trim();
const CAREERJET_STORE_APPROVED =
  String(process.env.CAREERJET_STORE_APPROVED || "true").toLowerCase() === "true";
const CAREERJET_DEFAULT_KEYWORDS = (process.env.CAREERJET_DEFAULT_KEYWORDS ||
  "security,guard,assistant,intern,driver,customer service,sales,admin,data,technician,engineer,developer,accountant,teacher,nurse,marketing,finance,hr,operations")
  .split(",")
  .map((keyword) => keyword.trim())
  .filter(Boolean);
const CAREERJET_DEFAULT_KEYWORD_LIMIT = Math.max(
  1,
  Number(process.env.CAREERJET_DEFAULT_KEYWORD_LIMIT || 8)
);
const CAREERJET_MAX_JOBS = Math.min(
  500,
  Math.max(50, Number(process.env.CAREERJET_MAX_JOBS || 300))
);

// ---------------- Utility functions ----------------

function normalizeType(text) {
  if (!text) return "Full-time";
  const t = text.toLowerCase();
  if (t.includes("intern")) return "Internship";
  if (t.includes("part")) return "Part-time";
  if (t.includes("contract")) return "Contract";
  if (t.includes("graduate") || t.includes("trainee")) return "Graduate Trainee";
  return "Full-time";
}

function detectCounty(text) {
  if (!text) return "";
  const lower = text.toLowerCase().replace(" county", "");
  const directMatch = KENYA_COUNTIES.find((county) =>
    lower.includes(county.toLowerCase())
  );
  if (directMatch) {
    return directMatch;
  }
  for (const [alias, county] of Object.entries(COUNTY_ALIASES)) {
    if (lower.includes(alias)) {
      return county;
    }
  }
  const parts = lower.split(/[|,\/\-]/).map((part) => part.trim());
  for (const part of parts) {
    if (!part) continue;
    const countyMatch = KENYA_COUNTIES.find((county) =>
      part.includes(county.toLowerCase())
    );
    if (countyMatch) {
      return countyMatch;
    }
    for (const [alias, county] of Object.entries(COUNTY_ALIASES)) {
      if (part.includes(alias)) {
        return county;
      }
    }
  }
  return "";
}

function normalizeCounty(location, fallbackText = "") {
  if (location) {
    const match = detectCounty(location);
    if (match) {
      return match;
    }
  }
  if (fallbackText) {
    const match = detectCounty(fallbackText);
    if (match) {
      return match;
    }
  }
  return "Nationwide";
}

function normalizeApplyUrl(url) {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (!trimmed || trimmed === "#") return "";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("mailto:") || lower.startsWith("tel:")) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return "";
  }
  if (trimmed.startsWith("/")) {
    return `https://www.careerjet.co.ke${trimmed}`;
  }
  return `https://${trimmed}`;
}

// Remove duplicates based on applyUrl
function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    if (!job.applyUrl) return false;
    if (seen.has(job.applyUrl)) return false;
    seen.add(job.applyUrl);
    return true;
  });
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    if (first) return first.replace(/^::ffff:/, "");
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) return String(realIp).trim().replace(/^::ffff:/, "");
  const socketIp = req.socket?.remoteAddress;
  if (socketIp) return String(socketIp).trim().replace(/^::ffff:/, "");
  return "127.0.0.1";
}

function getRefererUrl(req) {
  const referer = req.headers.referer;
  if (referer) return referer;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}/jobs.html`;
}

function getProxyEndpoint() {
  const raw = (process.env.CAREERJET_PROXY_ENDPOINT || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) {
    console.warn("CAREERJET_PROXY_ENDPOINT must be an absolute http(s) URL. Ignoring.");
    return "";
  }
  return raw.replace(/\/+$/, "");
}

function isSelfProxy(proxyEndpoint, req) {
  if (!proxyEndpoint || !req) return false;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
  if (!host) return false;
  const proto = String(req.headers["x-forwarded-proto"] || "https").trim();
  const origin = `${proto}://${host}`;
  return proxyEndpoint.startsWith(origin);
}

function pickQueryString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length) return String(value[0]);
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function formatErrorDetails(err) {
  if (!err) return "";
  const raw = err.responseBody || err.message || err;
  let text = "";
  if (typeof raw === "string") {
    text = raw;
  } else {
    try {
      text = JSON.stringify(raw);
    } catch (jsonErr) {
      text = String(raw);
    }
  }
  if (!text) return "";
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}
function mapCareerjetJob(job, page, index) {
  const createdAt = job.date ? new Date(job.date) : null;
  const rawDescription = job.description ? String(job.description) : "";
  const locationStr = Array.isArray(job.locations)
    ? job.locations.join(", ")
    : job.locations || job.location || "Kenya";
  const applyUrl = normalizeApplyUrl(job.redirect_url || job.url);

  return {
    id: `careerjet-${page}-${index}-${Date.now()}`,
    title: job.title || "Untitled Job",
    company: job.company || job.site || "Company",
    location: locationStr,
    applyUrl,
    createdAt,
    deadline: createdAt ? new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null,
    source: "Careerjet",
    type: normalizeType(job.title),
    description: rawDescription
      ? rawDescription.replace(/\s+/g, " ").slice(0, 150) + "..."
      : "",
    county: normalizeCounty(locationStr, `${job.title || ""} ${rawDescription}`),
    isInternship: job.title?.toLowerCase().includes("intern") || false
  };
}

function buildCacheKey({ page, perPage, keyword, location }) {
  const raw = JSON.stringify({
    page,
    perPage,
    keyword: (keyword || "").toLowerCase(),
    location: (location || "").toLowerCase(),
    locale: CAREERJET_LOCALE
  });
  return `careerjet_${createHash("sha1").update(raw).digest("hex")}`;
}

function buildCareerjetDocId(job) {
  const rawKey = job.applyUrl || `${job.title || ""}|${job.company || ""}|${job.location || ""}`;
  return `careerjet_${createHash("sha1").update(rawKey).digest("hex")}`;
}

// ---------------- Firestore ----------------

async function writeJobsToFirestore(jobs) {
  if (!CAREERJET_STORE_JOBS) return;
  const db = getAdminDb();
  if (!db) return;

  const batchSize = 400;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const chunk = jobs.slice(i, i + batchSize);
    const batch = db.batch();

    chunk.forEach((job) => {
      const docId = buildCareerjetDocId(job);
      const docRef = db.collection(CAREERJET_STORE_COLLECTION).doc(docId);
      const createdAtValue = job.createdAt instanceof Date ? job.createdAt : FieldValue.serverTimestamp();

      batch.set(
        docRef,
        {
          title: job.title || "Untitled Role",
          company: job.company || "Company",
          location: job.location || "Kenya",
          county: job.county || normalizeCounty(job.location || ""),
          applyUrl: job.applyUrl || "",
          type: job.type || normalizeType(job.title),
          description: job.description || "",
          source: "Careerjet",
          approved: CAREERJET_STORE_APPROVED,
          createdAt: createdAtValue,
          updatedAt: FieldValue.serverTimestamp(),
          isInternship: Boolean(job.isInternship)
        },
        { merge: true }
      );
    });

    await batch.commit();
  }
}

async function readCachedJobs(cacheKey, allowStale = false) {
  const db = getAdminDb();
  if (!db || !CAREERJET_CACHE_ENABLED || !CAREERJET_CACHE_TTL_MINUTES) return null;

  const snap = await db.collection(CAREERJET_CACHE_COLLECTION).doc(cacheKey).get();
  if (!snap.exists) return null;

  const data = snap.data() || {};
  const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt;
  if (!expiresAt) return null;

  const expiresMs = new Date(expiresAt).getTime();
  const expired = !Number.isFinite(expiresMs) || expiresMs <= Date.now();
  if (expired && !allowStale) return null;

  const jobs = Array.isArray(data.jobs) ? data.jobs : null;
  if (!jobs) return null;
  return { jobs, isStale: expired };
}

async function writeCachedJobs(cacheKey, jobs) {
  const db = getAdminDb();
  if (!db || !CAREERJET_CACHE_ENABLED || !CAREERJET_CACHE_TTL_MINUTES) return;

  const expiresAt = new Date(Date.now() + CAREERJET_CACHE_TTL_MINUTES * 60 * 1000);
  await db.collection(CAREERJET_CACHE_COLLECTION).doc(cacheKey).set({
    jobs,
    fetchedAt: FieldValue.serverTimestamp(),
    expiresAt
  });
}

// ---------------- Careerjet API ----------------

async function fetchCareerjetJobs(
  page,
  perPage,
  keyword,
  location,
  userIp,
  refererUrl,
  userAgent,
  apiKey
) {
  if (!apiKey) throw new Error("Missing CAREERJET_API_KEY");
  if (!location) location = "Kenya"; // default fix

  const params = new URLSearchParams({
    locale_code: CAREERJET_LOCALE,
    page,
    pagesize: perPage,
    sort: "date",
    user_ip: userIp,
    user_agent: userAgent,
    url: refererUrl
  });

  if (keyword) params.set("keywords", keyword);
  if (location.toLowerCase() !== "nationwide") params.set("location", location);

  const endpoint = `${CAREERJET_API_URL}?${params.toString()}`;
  const authString = Buffer.from(`${apiKey}:`).toString("base64");

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Basic ${authString}`,
      Referer: refererUrl,
      "User-Agent": userAgent
    }
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Careerjet API error:", response.status, text);
    const err = new Error(`Careerjet API error (${response.status})`);
    err.status = response.status;
    err.responseBody = text;
    throw err;
  }

  const data = await response.json();
  if (!data || !data.jobs) return [];
  return data.jobs.map((job, index) => mapCareerjetJob(job, page, index));
}

// ---------------- Main Handler ----------------

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const page = Math.max(1, Number(pickQueryString(req.query.page, "1")) || 1);
  const perPage = Math.min(
    50,
    Math.max(10, Number(pickQueryString(req.query.pageSize, String(JOBS_RESULTS_PER_PAGE))) || JOBS_RESULTS_PER_PAGE)
  );
  const keyword = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const location = typeof req.query.location === "string" ? req.query.location.trim() || "Kenya" : "Kenya";

  const keywordList = keyword
    ? [keyword]
    : CAREERJET_DEFAULT_KEYWORDS.slice(0, CAREERJET_DEFAULT_KEYWORD_LIMIT);

  const keywordCacheValue = keyword || keywordList.join("|") || "";
  const cacheKey = buildCacheKey({ page, perPage, keyword: keywordCacheValue, location });

  try {
    const cached = await readCachedJobs(cacheKey);
    if (cached?.jobs?.length) {
      res.setHeader("X-Cache-Status", cached.isStale ? "stale" : "hit");
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      return res.status(200).json({ total: cached.jobs.length, jobs: cached.jobs });
    }
  } catch (err) {
    console.warn("Careerjet cache read failed:", err);
  }

  let proxyEndpoint = getProxyEndpoint();
  if (proxyEndpoint && isSelfProxy(proxyEndpoint, req)) {
    console.warn("CAREERJET_PROXY_ENDPOINT points to this deployment. Ignoring to avoid proxy loops.");
    proxyEndpoint = "";
  }

  const apiKey = (process.env.CAREERJET_API_KEY || "").trim();
  if (!proxyEndpoint && !apiKey) {
    return res.status(500).json({ error: "Missing CAREERJET_API_KEY" });
  }

  try {
    let fetchedJobs = [];
    const refererUrl = getRefererUrl(req);
    const userIp = getClientIp(req);
    const userAgent = req.headers["user-agent"] || CAREERJET_USER_AGENT_FALLBACK;

    for (const keywordItem of keywordList) {
      const results = await fetchCareerjetJobs(page, perPage, keywordItem, location, userIp, refererUrl, userAgent, apiKey);
      fetchedJobs = fetchedJobs.concat(results);
      if (fetchedJobs.length >= CAREERJET_MAX_JOBS) break;
    }

    const jobs = dedupeJobs(fetchedJobs).slice(0, CAREERJET_MAX_JOBS);

    try { await writeCachedJobs(cacheKey, jobs); } catch (err) { console.warn("Cache write failed:", err); }
    try { await writeJobsToFirestore(jobs); } catch (err) { console.warn("Firestore write failed:", err); }

    res.setHeader("X-Cache-Status", "miss");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ total: jobs.length, jobs });

  } catch (err) {
    console.error("Error fetching Careerjet jobs:", err);
    const details = formatErrorDetails(err);
    if (CAREERJET_ALLOW_STALE_CACHE) {
      try {
        const cached = await readCachedJobs(cacheKey, true);
        if (cached?.jobs?.length) {
          res.setHeader("X-Cache-Status", "stale");
          res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
          return res.status(200).json({
            total: cached.jobs.length,
            jobs: cached.jobs,
            warning: "Careerjet unavailable, serving cached jobs."
          });
        }
      } catch (cacheErr) {
        console.warn("Stale cache read failed:", cacheErr);
      }
    }

    if (CAREERJET_DEBUG) {
      const debugInfo = {
        status: err?.status,
        message: String(err?.message || err),
        responseBody: err?.responseBody,
        keywordList,
        location,
        proxyEndpoint: proxyEndpoint || null,
        referer: getRefererUrl(req),
        userIp: getClientIp(req),
        userAgent: req.headers["user-agent"] || CAREERJET_USER_AGENT_FALLBACK,
        forwardedFor: req.headers["x-forwarded-for"] || null,
        host: req.headers["x-forwarded-host"] || req.headers.host || null
      };
      return res.status(500).json({ error: "Failed to fetch jobs", details, debug: debugInfo });
    }

    if (details) {
      return res.status(500).json({ error: "Failed to fetch jobs", details });
    }
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
}
