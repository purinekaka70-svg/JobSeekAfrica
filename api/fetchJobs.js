const CAREERJET_API_URL = "https://search.api.careerjet.net/v4/query";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.CAREERJET_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing CAREERJET_API_KEY" });
    return;
  }

  try {
    const forwarded = req.headers["x-forwarded-for"];
    const userIp = forwarded ? forwarded.split(",")[0].trim() : req.socket?.remoteAddress || "";
    const params = new URLSearchParams({
      locale_code: "en_KE",
      page: "1",
      page_size: "30",
      sort: "date",
      user_ip: userIp || "0.0.0.0",
      user_agent: "JobSeekAfrica/1.0"
    });
    params.set("api_key", apiKey);

    const response = await fetch(`${CAREERJET_API_URL}?${params.toString()}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`
      }
    });

    if (!response.ok) {
      res.status(response.status).json({ error: "Careerjet request failed" });
      return;
    }

    const data = await response.json();
    res.status(200).json({ jobs: data.jobs || [] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to fetch jobs right now" });
  }
}
