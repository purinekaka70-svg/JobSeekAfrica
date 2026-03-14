// api/fetchJobs.js

const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay",
  "Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu",
  "Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru",
  "Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua",
  "Nyeri","Samburu","Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia",
  "Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
];

const CAREERJET_API_KEY = process.env.CAREERJET_API_KEY;
const CAREERJET_LOCALE = "en_KE";
const CAREERJET_USER_AGENT = "Mozilla/5.0";

const JOBS_PAGES = Math.min(5, Math.max(1, Number(process.env.JOBS_PAGES || 3)));
const JOBS_RESULTS_PER_PAGE = Math.min(50, Math.max(10, Number(process.env.JOBS_RESULTS_PER_PAGE || 30)));

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

// Remove duplicate jobs by applyUrl
function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    const key = job.applyUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Get user IP for Careerjet API
function getUserIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0];
  return req.socket?.remoteAddress || "8.8.8.8"; // fallback
}

// Fetch jobs from Careerjet
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
      page_size: perPage,
      sort: "date",
      user_ip: userIp,
      user_agent: CAREERJET_USER_AGENT
    });

    if (keyword) params.set("keywords", keyword);
    if (location && location.toLowerCase() !== "nationwide") params.set("location", location);

    const endpoint = `https://search.api.careerjet.net/v4/query?${params}`;

    try {
      const response = await fetch(endpoint, {
        headers: { "User-Agent": CAREERJET_USER_AGENT }
      });

      if (!response.ok) {
        console.error("Careerjet API error:", response.status);
        break;
      }

      const data = await response.json();
      if (!data || !data.jobs) break;

      const mapped = data.jobs.map((job, index) => {
        const createdAt = job.date ? new Date(job.date) : null;

        // Convert locations array to string
        const locationStr = Array.isArray(job.locations)
          ? job.locations.join(", ")
          : job.locations || "Kenya";

        return {
          id: `careerjet-${page}-${index}-${Date.now()}`,
          title: job.title || "Untitled Job",
          company: job.company || job.site || "Company",
          location: locationStr,
          applyUrl: job.url || "#",
          createdAt,
          deadline: createdAt ? new Date(createdAt.getTime() + 30*24*60*60*1000) : null,
          source: "Careerjet",
          type: normalizeType(job.title),
          description: job.description
            ? job.description.replace(/\s+/g," ").slice(0,150) + "..."
            : "",
          county: normalizeCounty(locationStr),
          isInternship: job.title?.toLowerCase().includes("intern") || false
        };
      });

      jobs.push(...mapped);

    } catch (err) {
      console.error("Careerjet fetch error:", err);
      break;
    }
  }

  return jobs;
}

// Main API handler
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pages = Math.min(5, Math.max(1, Number(req.query.pages || JOBS_PAGES)));
  const perPage = Math.min(50, Math.max(10, Number(req.query.perPage || JOBS_RESULTS_PER_PAGE)));
  const keyword = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const location = typeof req.query.county === "string" ? req.query.county.trim() : "";

  const userIp = getUserIp(req);

  try {
    const fetchedJobs = await fetchCareerjetJobs(pages, perPage, keyword, location, userIp);
    const jobs = dedupeJobs(fetchedJobs);

    console.log(`Fetched ${jobs.length} jobs from Careerjet`);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ total: jobs.length, jobs });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch jobs" });
  }
}
