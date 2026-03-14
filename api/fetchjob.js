// api/careerjet.js

const CAREERJET_API_KEY = process.env.CAREERJET_API_KEY;
const CAREERJET_LOCALE = "en_KE";               // Change if needed
const CAREERJET_USER_AGENT = "Mozilla/5.0";

function getUserIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0];
  return req.socket?.remoteAddress || "8.8.8.8"; // fallback
}

export default async function handler(req, res) {

  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (!CAREERJET_API_KEY) {
    return res.status(500).json({ error: "CAREERJET_API_KEY is not set" });
  }

  const { q, location, page = "1", pageSize = "30" } = req.query;
  const userIp = getUserIp(req);

  const params = new URLSearchParams({
    api_key: CAREERJET_API_KEY,
    locale_code: CAREERJET_LOCALE,
    keywords: q || "",
    location: location || "",
    user_ip: userIp,
    user_agent: CAREERJET_USER_AGENT,
    page,
    page_size: pageSize,
    sort: "date"
  });

  const endpoint = `https://search.api.careerjet.net/v4/query?${params}`;

  try {
    const response = await fetch(endpoint, {
      headers: { "User-Agent": CAREERJET_USER_AGENT }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Careerjet API error:", response.status, text);
      return res.status(500).json({ error: "Careerjet API failed" });
    }

    const data = await response.json();

    // Return all jobs
    return res.status(200).json({
      total: data.hits || 0,
      jobs: data.jobs || []
    });

  } catch (error) {
    console.error("Fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch jobs" });
  }
}
