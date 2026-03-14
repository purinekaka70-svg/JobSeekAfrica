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

function normalizeType(type) {
  if (!type) return "Full-time";
  type = type.toLowerCase();
  if (type.includes("intern")) return "Internship";
  if (type.includes("part")) return "Part-time";
  if (type.includes("contract")) return "Contract";
  if (type.includes("graduate") || type.includes("trainee")) return "Graduate Trainee";
  return "Full-time";
}

function normalizeCounty(location) {
  if (!location) return "Nationwide";
  const lower = location.toLowerCase();
  const match = KENYA_COUNTIES.find(c => lower.includes(c.toLowerCase()));
  return match || "Nationwide";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.CAREERJET_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing CAREERJET_API_KEY" });

  try {
    const params = new URLSearchParams({
      locale_code: "en_KE",
      page: "1",
      page_size: "50",
      sort: "date",
      user_ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0",
      user_agent: req.headers["user-agent"] || "JobSeekAfrica/1.0",
      api_key: apiKey
    });

    const endpoint = `${CAREERJET_API_URL}?${params.toString()}`;

    const response = await fetch(endpoint);
    if (!response.ok) throw new Error("Careerjet API failed");

    const data = await response.json();
    if (!data.jobs || !Array.isArray(data.jobs)) return res.status(200).json({ jobs: [] });

    const jobs = data.jobs.map(job => ({
      id: job.url || `${job.title}-${job.company}`,
      title: job.title || "Untitled Role",
      company: job.company || job.site || "Company",
      location: job.locations || "Kenya",
      county: normalizeCounty(job.locations),
      applyUrl: job.url || "#",
      type: normalizeType(job.type || job.title),
      description: job.description ? job.description.replace(/\s+/g, " ").slice(0, 140) + "..." : "",
      source: "Careerjet"
    }));

    res.status(200).json({ jobs });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
}
