// api/syncJobs.js
// Admin-only sync to fetch the latest Careerjet jobs, store them in Firestore,
// and prune older Careerjet jobs so only the latest set remains.

import { createHash } from "crypto";
import { getAdminDb, FieldValue } from "./_firebaseAdmin.js";

const CAREERJET_API_URL = "https://search.api.careerjet.net/v4/query";

const CAREERJET_API_KEY = (process.env.CAREERJET_API_KEY || "").trim();
const CAREERJET_LOCALE = (process.env.CAREERJET_LOCALE || "en_KE").trim();
const CAREERJET_USER_AGENT =
  (process.env.CAREERJET_USER_AGENT || "JobSeekAfrica/1.0").trim();
const CAREERJET_PAGES = Math.min(
  10,
  Math.max(1, Number(process.env.CAREERJET_PAGES || 6))
);
const CAREERJET_PAGE_SIZE = Math.min(
  50,
  Math.max(10, Number(process.env.CAREERJET_PAGE_SIZE || 50))
);
const CAREERJET_MAX_JOBS = Math.min(
  500,
  Math.max(50, Number(process.env.CAREERJET_MAX_JOBS || 300))
);
const JOBS_COLLECTION = (process.env.JOBS_COLLECTION || "jobs").trim();
const MANUAL_SYNC_TOKEN = (process.env.MANUAL_SYNC_TOKEN || "").trim();

const KENYA_COUNTIES = [
  "Baringo",
  "Bomet",
  "Bungoma",
  "Busia",
  "Elgeyo-Marakwet",
  "Embu",
  "Garissa",
  "Homa Bay",
  "Isiolo",
  "Kajiado",
  "Kakamega",
  "Kericho",
  "Kiambu",
  "Kilifi",
  "Kirinyaga",
  "Kisii",
  "Kisumu",
  "Kitui",
  "Kwale",
  "Laikipia",
  "Lamu",
  "Machakos",
  "Makueni",
  "Mandera",
  "Marsabit",
  "Meru",
  "Migori",
  "Mombasa",
  "Murang'a",
  "Nairobi",
  "Nakuru",
  "Nandi",
  "Narok",
  "Nyamira",
  "Nyandarua",
  "Nyeri",
  "Samburu",
  "Siaya",
  "Taita-Taveta",
  "Tana River",
  "Tharaka-Nithi",
  "Trans Nzoia",
  "Turkana",
  "Uasin Gishu",
  "Vihiga",
  "Wajir",
  "West Pokot"
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

function normalizeType(rawType) {
  if (!rawType) return "Full-time";
  const value = rawType.toString().toLowerCase();
  if (value.includes("part")) return "Part-time";
  if (value.includes("intern")) return "Internship";
  if (value.includes("contract")) return "Contract";
  if (value.includes("graduate") || value.includes("trainee")) return "Graduate Trainee";
  return "Full-time";
}

function inferInternship(job) {
  const title = (job.title || "").toLowerCase();
  const type = (job.type || "").toLowerCase();
  return title.includes("intern") || type.includes("intern");
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
  const parts = lower.split(/[|,\\/\\-]/).map((part) => part.trim());
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

function normalizeCountyFromLocation(location, fallbackText = "") {
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

function computeDeadline(created) {
  if (!created) return null;
  const date = new Date(created);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 30);
  return date;
}

function makeDocId(job) {
  const key = job.url || `${job.title}-${job.company}-${job.locations}`;
  return `careerjet_${createHash("sha1").update(key).digest("hex")}`;
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

async function getEgressIp() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const ip = String(data?.ip || "").trim();
    return ip || null;
  } catch (error) {
    return null;
  }
}

async function fetchCareerjetJobs(userIp) {
  if (!CAREERJET_API_KEY) {
    throw new Error("Missing CAREERJET_API_KEY");
  }

  const jobs = [];
  const authHeader = `Basic ${Buffer.from(`${CAREERJET_API_KEY}:`).toString("base64")}`;

  for (let page = 1; page <= CAREERJET_PAGES; page += 1) {
    const params = new URLSearchParams({
      locale_code: CAREERJET_LOCALE,
      sort: "date",
      page: String(page),
      page_size: String(CAREERJET_PAGE_SIZE),
      fragment_size: "140",
      user_ip: userIp,
      user_agent: CAREERJET_USER_AGENT
    });

    const response = await fetch(`${CAREERJET_API_URL}?${params.toString()}`, {
      headers: {
        Authorization: authHeader
      }
    });

    if (!response.ok) {
      throw new Error(`Careerjet request failed: ${response.status}`);
    }

    const data = await response.json();
    if (data.type !== "JOBS") {
      break;
    }

    const pageJobs = (data.jobs || []).map((job) => {
      const title = job.title || "Untitled Role";
      const type = normalizeType(title);
      const createdAt = job.date ? new Date(job.date) : new Date();
      const deadline = computeDeadline(job.date);
      const rawDescription = job.description ? String(job.description) : "";
      const description = rawDescription
        ? rawDescription.replace(/\s+/g, " ").slice(0, 200)
        : "";
      const location = Array.isArray(job.locations)
        ? job.locations.join(", ")
        : job.locations || job.location || "Kenya";
      const county = normalizeCountyFromLocation(
        location,
        `${title} ${rawDescription}`
      );
      const applyUrl = normalizeApplyUrl(job.redirect_url || job.url);
      return {
        id: makeDocId(job),
        title,
        company: job.company || job.site || "Company",
        location,
        county,
        category: "General",
        type,
        description,
        applyUrl,
        deadline,
        createdAt,
        source: "Careerjet",
        isInternship: inferInternship({ title, type }),
        externalId: job.url || applyUrl || "",
        approved: true
      };
    });

    jobs.push(...pageJobs);
    if (jobs.length >= CAREERJET_MAX_JOBS) {
      break;
    }
  }

  return jobs.slice(0, CAREERJET_MAX_JOBS);
}

async function saveJobsToFirestore(jobs) {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT");
  }
  const batchSize = 400;

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = db.batch();
    const slice = jobs.slice(i, i + batchSize);

    slice.forEach((job) => {
      const docRef = db.collection(JOBS_COLLECTION).doc(job.id);
      const createdAtValue = job.createdAt instanceof Date ? job.createdAt : new Date();
      batch.set(
        docRef,
        {
          title: job.title,
          company: job.company,
          location: job.location,
          county: job.county,
          category: job.category,
          type: job.type,
          description: job.description,
          applyUrl: job.applyUrl,
          deadline: job.deadline ? new Date(job.deadline) : null,
          createdAt: createdAtValue,
          updatedAt: FieldValue.serverTimestamp(),
          source: job.source,
          externalId: job.externalId,
          approved: true
        },
        { merge: true }
      );
    });

    await batch.commit();
  }
}

async function pruneCareerjetJobs(keepIds) {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT");
  }

  const snapshot = await db
    .collection(JOBS_COLLECTION)
    .where("source", "==", "Careerjet")
    .get();

  if (snapshot.empty) {
    return 0;
  }

  let deleted = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snapshot.docs) {
    if (keepIds.has(docSnap.id)) {
      continue;
    }
    batch.delete(docSnap.ref);
    deleted += 1;
    batchCount += 1;

    if (batchCount >= 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return deleted;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token =
    req.query.token ||
    req.headers["x-sync-token"] ||
    req.headers["x-jobseek-token"] ||
    "";

  if (MANUAL_SYNC_TOKEN && token !== MANUAL_SYNC_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const requestIp = getClientIp(req);
    const egressIp = await getEgressIp();
    const userIp = egressIp || requestIp;
    const jobs = await fetchCareerjetJobs(userIp);
    if (!jobs.length) {
      return res.status(200).json({ message: "No jobs returned from Careerjet.", count: 0 });
    }

    await saveJobsToFirestore(jobs);
    const pruned = await pruneCareerjetJobs(new Set(jobs.map((job) => job.id)));

    return res.status(200).json({
      message: "Sync complete.",
      count: jobs.length,
      pruned,
      ip: userIp,
      ipSource: egressIp ? "egress" : "request"
    });
  } catch (error) {
    console.error("Sync failed:", error);
    return res.status(500).json({ error: "Sync failed." });
  }
}
