// api/fetchJobs.js
import fetch from "node-fetch"; // Node <18 only

const CAREERJET_API_URL = "https://search.api.careerjet.net/v4/query";

const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa",
  "Homa Bay","Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga",
  "Kisii","Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera",
  "Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok",
  "Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River",
  "Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
];

function normalizeType(text) {
  if (!text) return "Full-time";
  const t = text.toLowerCase();
  if (t.includes("intern")) return "Internship";
  if (t.includes("part")) return "Part-time";
  if (t.includes("contract")) return "Contract";
  if (t.includes("graduate") || t.includes("trainee")) return "Graduate Trainee";
  return "Full-time";
}

function normalizeCounty(location) {
  if (!location) return "Nationwide";
  const lower = location.toLowerCase();
  const match = KENYA_COUNTIES.find(c => lower.includes(c.toLowerCase()));
  return match || "Nationwide";
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.CAREERJET_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing CAREERJET_API_KEY" });

  const { q = "", location = "", page = "1", pageSize = "50" } = req.query;

  try {
    const params = new URLSearchParams({
      locale_code: "en_KE",
      page,
      page_size: pageSize,
      sort: "date",
      user_ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0",
      user_agent: req.headers["user-agent"] || "JobSeekAfrica/1.0",
      api_key: apiKey
    });

    if (q) params.set("keywords", q);
    if (location) params.set("location", location);

    const endpoint = `${CAREERJET_API_URL}?${params.toString()}`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      const text = await response.text();
      console.error("Careerjet API error:", response.status, text);
      throw new Error("Careerjet API failed");
    }

    const data = await response.json();

    if (!data.jobs || !Array.isArray(data.jobs)) {
      return res.status(200).json({ total: 0, jobs: [] });
    }

    // Map jobs with consistent structure
    const jobs = dedupeJobs(data.jobs.map(job => ({
      id: job.url || `${job.title}-${job.company}`,
      title: job.title || "Untitled Role",
      company: job.company || job.site || "Company",
      location: job.locations || "Kenya",
      county: normalizeCounty(job.locations),
      applyUrl: job.url || "#",
      type: normalizeType(job.type || job.title),
      description: job.description ? job.description.replace(/\s+/g, " ").slice(0, 200) + "..." : "",
      source: "Careerjet"
    })));

    res.status(200).json({ total: jobs.length, jobs });

  } catch (err) {
    console.error("Error fetching Careerjet jobs:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
}
