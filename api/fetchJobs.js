// api/fetchJobs.js
const CAREERJET_API_URL = "https://search.api.careerjet.net/v4/query";

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

// Normalize county from location string
function normalizeCountyFromLocation(location) {
  if (!location) return "Nationwide";
  const lower = location.toLowerCase().replace(" county", "");
  const match = KENYA_COUNTIES.find((county) => lower.includes(county.toLowerCase()));
  return match || "Nationwide";
}

// Deduplicate jobs
function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = job.applyUrl || `${job.title}-${job.company}-${job.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Get user IP from request headers
function getUserIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "0.0.0.0";
}

// Build Basic Auth header
function buildBasicAuthHeader(apiKey) {
  if (!apiKey) return "";
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

// Fetch jobs from Careerjet API
async function fetchCareerjetJobs(pages, perPage, keyword, location, userIp, userAgent, apiKey) {
  const jobs = [];
  const authHeader = buildBasicAuthHeader(apiKey);

  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      locale_code: "en_KE",
      page: String(page),
      page_size: String(perPage),
      sort: "date",
      user_ip: userIp,
      user_agent: userAgent || "Mozilla/5.0",
      api_key: apiKey
    });

    if (keyword) params.set("keywords", keyword);
    if (location && location.toLowerCase() !== "nationwide") params.set("location", location);

    const endpoint = `${CAREERJET_API_URL}?${params.toString()}`;
    const response = await fetch(endpoint, {
      headers: authHeader ? { Authorization: authHeader } : undefined
    });

    if (!response.ok) break;

    const data = await response.json();
    if (!data.jobs || !Array.isArray(data.jobs)) break;

    const normalized = data.jobs.map((job, index) => {
      return {
        id: `careerjet-${page}-${index}`,
        title: job.title || "Untitled Role",
        company: job.company || job.site || "Company",
        location: job.locations || "Kenya",
        applyUrl: job.url || "#",
        deadline: job.date ? new Date(job.date).toISOString() : null,
        createdAt: job.date ? new Date(job.date).toISOString() : null,
        source: "Careerjet",
        category: job.category || "General",
        type: normalizeType(job.type || job.title),
        description: job.description
          ? job.description.replace(/\s+/g, " ").slice(0, 140) + "..."
          : "",
        county: normalizeCountyFromLocation(job.locations)
      };
    });

    jobs.push(...normalized);
  }

  return dedupeJobs(jobs);
}

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
    const pages = Math.min(5, Math.max(1, Number(req.query.pages || 2)));
    const perPage = Math.min(50, Math.max(10, Number(req.query.perPage || 30)));
    const keyword = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const location = typeof req.query.county === "string" ? req.query.county.trim() : "";
    const userIp = getUserIp(req);
    const userAgent = req.headers["user-agent"] || "JobSeekAfrica/1.0";

    const jobs = await fetchCareerjetJobs(pages, perPage, keyword, location, userIp, userAgent, apiKey);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ jobs });
  } catch (error) {
    console.error("Careerjet fetch error:", error);
    res.status(500).json({ error: "Unable to fetch jobs right now" });
  }
}
