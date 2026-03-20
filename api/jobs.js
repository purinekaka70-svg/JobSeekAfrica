// api/fetchJobs.js

import fetch from "node-fetch";
import { getFirestore } from "firebase-admin/firestore";
import admin from "firebase-admin";

// Initialize Firebase if not already
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}
const db = getFirestore();

const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay",
  "Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu",
  "Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru",
  "Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua",
  "Nyeri","Samburu","Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia",
  "Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
];

// Env vars
const CAREERJET_API_KEY = process.env.CAREERJET_API_KEY;
const CAREERJET_LOCALE = "en_KE";
const CAREERJET_USER_AGENT = "Mozilla/5.0";
const DEFAULT_JOB_LOCATION = process.env.DEFAULT_JOB_LOCATION || "Kenya";

// Increased pages (for more jobs)
const JOBS_PAGES = Math.min(10, Math.max(1, Number(process.env.JOBS_PAGES || 6)));
const JOBS_RESULTS_PER_PAGE = Math.min(50, Math.max(10, Number(process.env.JOBS_RESULTS_PER_PAGE || 50)));

const CACHE_COLLECTION = process.env.CAREERJET_CACHE_COLLECTION || "careerjet_cache";
const CACHE_TTL_MINUTES = Number(process.env.CAREERJET_CACHE_TTL_MINUTES || 5);

// Normalize job type
function normalizeType(text) {
  if (!text) return "Full-time";
  const t = text.toLowerCase();
  if (t.includes("intern")) return "Internship";
  if (t.includes("part")) return "Part-time";
  if (t.includes("contract")) return "Contract";
  if (t.includes("graduate") || t.includes("trainee")) return "Graduate Trainee";
  return "Full-time";
}

// Normalize county
function normalizeCounty(location) {
  if (!location) return "Nationwide";
  const lower = location.toLowerCase();
  for (const county of KENYA_COUNTIES) {
    if (lower.includes(county.toLowerCase())) return county;
  }
  return "Nationwide";
}

// Remove duplicate jobs
function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    const key = job.applyUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Get user IP
function getUserIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0];
  return req.socket?.remoteAddress || "8.8.8.8";
}

//  Fetch jobs from Careerjet
async function fetchCareerjetJobs(pages, perPage, keyword, location, userIp) {
  if (!CAREERJET_API_KEY) {
    console.error("Missing CAREERJET_API_KEY");
    return [];
  }

  const jobs = [];

  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      api_key: CAREERJET_API_KEY,
      locale_code: CAREERJET_LOCALE,
      page,
      pagesize: perPage, //  FIXED
      sort: "date",
      user_ip: userIp,
      user_agent: CAREERJET_USER_AGENT,
    });

    if (keyword) params.set("keywords", keyword);
    if (location && location.toLowerCase() !== "nationwide") {
      params.set("location", location);
    }

    const endpoint = `https://search.api.careerjet.net/v4/query?${params}`;

    try {
      const response = await fetch(endpoint, {
        headers: { "User-Agent": CAREERJET_USER_AGENT },
      });

      if (!response.ok) {
        console.error("Careerjet API error:", response.status);
        continue; //  FIXED (was break)
      }

      const data = await response.json();
      if (!data?.jobs) continue;

      const mapped = data.jobs.map((job, index) => {
        const createdAt = job.date ? new Date(job.date) : null;
        const locationStr = Array.isArray(job.locations)
          ? job.locations.join(", ")
          : job.locations || DEFAULT_JOB_LOCATION;

        return {
          id: `careerjet-${page}-${index}-${Date.now()}`,
          title: job.title || "Untitled Job",
          company: job.company || job.site || "Company",
          location: locationStr,
          applyUrl: job.url || "#",
          createdAt,
          deadline: createdAt
            ? new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
            : null,
          source: "Careerjet",
          type: normalizeType(job.title),
          description: job.description
            ? job.description.replace(/\s+/g, " ").slice(0, 150) + "..."
            : "",
          county: normalizeCounty(locationStr),
          isInternship: job.title?.toLowerCase().includes("intern") || false,
        };
      });

      jobs.push(...mapped);

    } catch (err) {
      console.error("Careerjet fetch error:", err);
      continue; //  continue instead of break
    }
  }

  return jobs;
}

//  Cache
async function getCachedJobs(keyword, location) {
  const cacheRef = db.collection(CACHE_COLLECTION)
    .doc(`${keyword || "all"}-${location || DEFAULT_JOB_LOCATION}`);

  const doc = await cacheRef.get();
  if (!doc.exists) return null;

  const data = doc.data();
  const ageMinutes = (Date.now() - data.fetchedAt.toMillis()) / (1000 * 60);

  if (ageMinutes > CACHE_TTL_MINUTES) return null;
  return data.jobs || null;
}

async function setCachedJobs(keyword, location, jobs) {
  const cacheRef = db.collection(CACHE_COLLECTION)
    .doc(`${keyword || "all"}-${location || DEFAULT_JOB_LOCATION}`);

  await cacheRef.set({
    fetchedAt: admin.firestore.Timestamp.now(),
    jobs,
  });
}

//  NEW: Permanent storage
async function storeJobsPermanently(jobs) {
  const batch = db.batch();

  jobs.forEach(job => {
    const ref = db.collection("jobs").doc(job.id);
    batch.set(ref, job, { merge: true });
  });

  await batch.commit();
}

// MAIN HANDLER
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pages = Math.min(10, Math.max(1, Number(req.query.pages || JOBS_PAGES)));
  const perPage = Math.min(50, Math.max(10, Number(req.query.perPage || JOBS_RESULTS_PER_PAGE)));
  const keyword = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const location = typeof req.query.county === "string"
    ? req.query.county.trim()
    : DEFAULT_JOB_LOCATION;

  const userIp = getUserIp(req);

  try {
    let jobs = await getCachedJobs(keyword, location);

    if (!jobs) {
      const fetchedJobs = await fetchCareerjetJobs(
        pages,
        perPage,
        keyword,
        location,
        userIp
      );

      jobs = dedupeJobs(fetchedJobs);

      await setCachedJobs(keyword, location, jobs);

      //  SAVE TO FIRESTORE
      await storeJobsPermanently(jobs);
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

    return res.status(200).json({
      total: jobs.length,
      jobs,
    });

  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({
      error: "Failed to fetch jobs",
    });
  }
}
