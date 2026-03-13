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

const CAREERJET_API_KEY = process.env.CAREERJET_API_KEY || process.env.CAREERJET_PUBLISHER_KEY;
const CAREERJET_LOCALE = process.env.CAREERJET_LOCALE || "en_KE";
const CAREERJET_USER_IP = process.env.CAREERJET_USER_IP;
const CAREERJET_USER_AGENT = process.env.CAREERJET_USER_AGENT;

const JOBS_PAGES = Math.min(5, Math.max(1, Number(process.env.JOBS_PAGES || 2)));
const JOBS_RESULTS_PER_PAGE = Math.min(50, Math.max(10, Number(process.env.JOBS_RESULTS_PER_PAGE || 30)));

function computeDeadline(created) {
  if (!created) {
    return null;
  }
  const date = new Date(created);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setDate(date.getDate() + 30);
  return date;
}

function normalizeType(rawType) {
  if (!rawType) {
    return "Full-time";
  }
  const value = rawType.toString().toLowerCase();
  if (value.includes("part")) {
    return "Part-time";
  }
  if (value.includes("intern")) {
    return "Internship";
  }
  if (value.includes("contract")) {
    return "Contract";
  }
  if (value.includes("graduate") || value.includes("trainee")) {
    return "Graduate Trainee";
  }
  return "Full-time";
}

function inferInternship(job) {
  const title = (job.title || "").toLowerCase();
  const type = (job.type || "").toLowerCase();
  return title.includes("intern") || type.includes("intern");
}

function normalizeCountyFromLocation(location) {
  if (!location) {
    return "Nationwide";
  }

  const areas = Array.isArray(location.area) ? location.area : [];
  const displayName = typeof location === "string" ? location : location.display_name;
  const candidates = [displayName, ...areas].filter(Boolean);

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase().replace(" county", "");
    const match = KENYA_COUNTIES.find((county) => lower.includes(county.toLowerCase()));
    if (match) {
      return match;
    }
  }

  return "Nationwide";
}

function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = job.applyUrl || `${job.title}-${job.company}-${job.location}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getUserIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "";
}

function buildBasicAuthHeader(apiKey) {
  if (!apiKey) return "";
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

async function fetchCareerjetJobs(pages, perPage, keyword, location, userIp, userAgent) {
  if (!CAREERJET_API_KEY || !userIp) {
    return [];
  }

  const jobs = [];
  const authHeader = buildBasicAuthHeader(CAREERJET_API_KEY);

  for (let page = 1; page <= pages; page += 1) {
    const params = new URLSearchParams({
      locale_code: CAREERJET_LOCALE,
      sort: "date",
      page: String(page),
      page_size: String(perPage),
      fragment_size: "140",
      user_ip: userIp,
      user_agent: userAgent || "Mozilla/5.0"
    });

    // Some Careerjet setups accept api_key as a query param.
    params.set("api_key", CAREERJET_API_KEY);

    if (keyword) {
      params.set("keywords", keyword);
    }
    if (location && location.toLowerCase() !== "nationwide") {
      params.set("location", location);
    }

    const endpoint = `https://search.api.careerjet.net/v4/query?${params}`;
    const response = await fetch(endpoint, {
      headers: authHeader
        ? {
            Authorization: authHeader
          }
        : undefined
    });
    if (!response.ok) {
      break;
    }
    const data = await response.json();
    if (data.type !== "JOBS") {
      break;
    }
    const pageJobs = (data.jobs || []).map((job, index) => {
      const title = job.title || "Untitled Role";
      const type = normalizeType(title);
      const description = job.description
        ? job.description.replace(/\s+/g, " ").slice(0, 140) + "..."
        : "";
      const createdAt = job.date ? new Date(job.date) : null;
      const normalized = {
        id: `careerjet-${page}-${index}`,
        title,
        company: job.company || job.site || "Company",
        location: job.locations || "Kenya",
        applyUrl: job.url || "#",
        deadline: computeDeadline(job.date),
        createdAt,
        source: "Careerjet",
        category: "General",
        type,
        description,
        county: normalizeCountyFromLocation(job.locations)
      };
      normalized.isInternship = inferInternship(normalized);
      return normalized;
    });
    jobs.push(...pageJobs);
  }

  return jobs;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const pages = Math.min(
    5,
    Math.max(1, Number(req.query.pages || JOBS_PAGES))
  );
  const perPage = Math.min(
    50,
    Math.max(10, Number(req.query.perPage || JOBS_RESULTS_PER_PAGE))
  );
  const keyword = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const location = typeof req.query.county === "string" ? req.query.county.trim() : "";

  const userIp = getUserIp(req) || CAREERJET_USER_IP || "";
  const userAgent =
    req.headers["user-agent"] || CAREERJET_USER_AGENT || "Mozilla/5.0";

  const careerjetJobs = await fetchCareerjetJobs(
    pages,
    perPage,
    keyword,
    location,
    userIp,
    userAgent
  );

  const jobs = dedupeJobs([...careerjetJobs]);

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({ jobs });
}
