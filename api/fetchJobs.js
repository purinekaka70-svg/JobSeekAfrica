// api/fetchJobs.js
import fetch from "node-fetch"; // Only needed in Node <18; Vercel/Next 18+ supports fetch natively

const CAREERJET_API_URL = "https://search.api.careerjet.net/v4/query";

// Kenyan counties for normalization
const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa",
  "Homa Bay","Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga",
  "Kisii","Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera",
  "Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok",
  "Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River",
  "Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
];

// Normalize job type
function normalizeType(rawType) {
  if (!rawType) return "Full-time";
  const value = rawType.toString().toLowerCase();
  if (value.includes("part")) return "Part-time";
  if (value.includes("intern")) return "Internship";
  if (value.includes("contract")) return "Contract";
  if (value.includes("graduate") || value.includes("trainee")) return "Graduate Trainee";
  return "Full-time";
}

// Normalize county from location
function normalizeCountyFromLocation(location) {
  if (!location) return "Nationwide";
  const lower = location.toLowerCase().replace(" county", "");
  const match = KENYA_COUNTIES.find(c => lower.includes(c.toLowerCase()));
  return match || "Nationwide";
}

// Deduplicate jobs
function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    const key = job.applyUrl || `${job.title}-${job.company}-${job.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Get user IP
function getUserIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "0.0.0.0";
}

// Build Basic Auth header for Careerjet
function buildBasicAuthHeader(apiKey) {
  if (!apiKey) return "";
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

// Fetch jobs from Careerjet with batching to avoid timeout
async function fetchCareerjetJobs(totalPages, perPage, keyword, location, userIp, userAgent, apiKey) {
  const jobs = [];
  const authHeader = buildBasicAuthHeader(apiKey);

  // Batch fetch 5 pages at a time to reduce API stress
  const batchSize = 5;
  for (let i = 1; i <= totalPages; i += batchSize) {
    const batchPages = Array.from({ length: Math.min(batchSize, totalPages - i + 1) }, (_, idx) => i + idx);

    const batchFetches = batchPages.map(async (page) => {
      const params = new URLSearchParams({
        locale_code: "en_KE",
        page: String(page),
        page_size: String(perPage),
        sort: "date",
        user_ip: userIp,
        user_agent: userAgent || "JobSeekAfrica/1.0",
        api_key: apiKey
      });

      if (keyword) params.set("keywords", keyword);
      if (location && location.toLowerCase() !== "nationwide") params.set("location", location);

      const endpoint = `${CAREERJET_API_URL}?${params.toString()}`;

      try {
        const res = await fetch(endpoint, { headers: authHeader ? { Authorization: authHeader } : undefined });
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.jobs || !Array.isArray(data.jobs)) return [];

        return data.jobs.map((job, index) => ({
          id: `careerjet-${page}-${index}`,
          title: job.title || "Untitled Role",
          company: job.company || job.site || "Company",
          location: job.locations || "Kenya",
          applyUrl: job.url || "#", // Official job URL
          deadline: job.date ? new Date(job.date).toISOString() : null,
          createdAt: job.date ? new Date(job.date).toISOString() : null,
          source: "Careerjet",
          category: job.category || "General",
          type: normalizeType(job.type || job.title),
          description: job.description
            ? job.description.replace(/\s+/g, " ").slice(0, 140) + "..."
            : "",
          county: normalizeCountyFromLocation(job.locations)
        }));
      } catch (err) {
        console.error("Careerjet batch fetch error:", err);
        return [];
      }
    });

    const results = await Promise.all(batchFetches);
    results.forEach(arr => jobs.push(...arr));
  }

  return dedupeJobs(jobs);
}

// Main handler
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.CAREERJET_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing CAREERJET_API_KEY" });

  try {
    const totalPages = Math.min(50, Math.max(1, Number(req.query.pages || 50))); // up to 50 pages
    const perPage = Math.min(50, Math.max(10, Number(req.query.perPage || 50))); // up to 50 jobs per page
    const keyword = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const location = typeof req.query.county === "string" ? req.query.county.trim() : "";
    const userIp = getUserIp(req);
    const userAgent = req.headers["user-agent"] || "JobSeekAfrica/1.0";

    const jobs = await fetchCareerjetJobs(totalPages, perPage, keyword, location, userIp, userAgent, apiKey);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ jobs });
  } catch (error) {
    console.error("Careerjet fetch error:", error);
    res.status(500).json({ error: "Unable to fetch jobs right now" });
  }
}
