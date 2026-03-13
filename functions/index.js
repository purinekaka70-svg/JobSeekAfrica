const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { createHash } = require("crypto");

initializeApp();

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

const CAREERJET_ENDPOINT = "https://search.api.careerjet.net/v4/query";
const CAREERJET_API_KEY = process.env.CAREERJET_API_KEY;
const CAREERJET_LOCALE = process.env.CAREERJET_LOCALE || "en_KE";
const CAREERJET_USER_IP = process.env.CAREERJET_USER_IP;
const CAREERJET_USER_AGENT =
  process.env.CAREERJET_USER_AGENT || "JobSeekAfrica/1.0 (+https://jobseekafrica.com)";
const CAREERJET_PAGES = Math.min(10, Math.max(1, Number(process.env.CAREERJET_PAGES || 2)));
const CAREERJET_PAGE_SIZE = Math.min(
  50,
  Math.max(10, Number(process.env.CAREERJET_PAGE_SIZE || 30))
);

const JOBS_COLLECTION = process.env.JOBS_COLLECTION || "jobs";
const MANUAL_SYNC_TOKEN = process.env.MANUAL_SYNC_TOKEN || "";

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
  const lower = location.toLowerCase().replace(" county", "");
  const match = KENYA_COUNTIES.find((county) => lower.includes(county.toLowerCase()));
  return match || "Nationwide";
}

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

function makeDocId(job) {
  const key = job.url || `${job.title}-${job.company}-${job.locations}`;
  return `careerjet_${createHash("sha1").update(key).digest("hex")}`;
}

async function fetchCareerjetJobs() {
  if (!CAREERJET_API_KEY) {
    throw new Error("Missing CAREERJET_API_KEY");
  }
  if (!CAREERJET_USER_IP) {
    throw new Error("Missing CAREERJET_USER_IP");
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
      user_ip: CAREERJET_USER_IP,
      user_agent: CAREERJET_USER_AGENT
    });

    const response = await fetch(`${CAREERJET_ENDPOINT}?${params.toString()}`, {
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
      const description = job.description
        ? job.description.replace(/\s+/g, " ").slice(0, 200)
        : "";
      const location = job.locations || "Kenya";
      const normalized = {
        id: makeDocId(job),
        title,
        company: job.company || job.site || "Company",
        location,
        county: normalizeCountyFromLocation(location),
        category: "General",
        type,
        description,
        applyUrl: job.url || "",
        deadline,
        createdAt,
        source: "Careerjet",
        isInternship: inferInternship({ title, type }),
        externalId: job.url || "",
        approved: true
      };
      return normalized;
    });

    jobs.push(...pageJobs);
  }

  return jobs;
}

async function saveJobsToFirestore(jobs) {
  const db = getFirestore();
  const now = Timestamp.now();
  const batchSize = 400;

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = db.batch();
    const slice = jobs.slice(i, i + batchSize);

    slice.forEach((job) => {
      const docRef = db.collection(JOBS_COLLECTION).doc(job.id);
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
          deadline: job.deadline ? Timestamp.fromDate(new Date(job.deadline)) : null,
          createdAt: Timestamp.fromDate(new Date(job.createdAt)),
          updatedAt: now,
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

exports.syncCareerjetJobs = onSchedule("every 6 hours", async () => {
  console.log("Starting Careerjet sync...");

  const jobs = await fetchCareerjetJobs();
  if (!jobs.length) {
    console.log("No jobs returned from Careerjet.");
    return;
  }

  await saveJobsToFirestore(jobs);
  console.log(`Saved ${jobs.length} jobs to Firestore.`);
});

exports.syncCareerjetJobsNow = onRequest({ cors: true }, async (req, res) => {
  const token =
    req.query.token ||
    req.headers["x-sync-token"] ||
    req.headers["x-jobseek-token"] ||
    "";

  if (!MANUAL_SYNC_TOKEN || token !== MANUAL_SYNC_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const jobs = await fetchCareerjetJobs();
    if (!jobs.length) {
      res.status(200).json({ message: "No jobs returned from Careerjet.", count: 0 });
      return;
    }
    await saveJobsToFirestore(jobs);
    res.status(200).json({ message: "Sync complete.", count: jobs.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Sync failed." });
  }
});
