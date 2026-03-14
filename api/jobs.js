const KENYA_COUNTIES = [
"Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay",
"Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu",
"Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru",
"Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua",
"Nyeri","Samburu","Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia",
"Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
];

const CAREERJET_API_KEY = process.env.CAREERJET_API_KEY;
const CAREERJET_LOCALE = process.env.CAREERJET_LOCALE || "en_KE";
const CAREERJET_USER_AGENT = process.env.CAREERJET_USER_AGENT || "Mozilla/5.0";

const JOBS_PAGES = Math.min(5, Math.max(1, Number(process.env.JOBS_PAGES || 3)));
const JOBS_RESULTS_PER_PAGE = Math.min(50, Math.max(10, Number(process.env.JOBS_RESULTS_PER_PAGE || 30)));

function normalizeType(text) {
if (!text) return "Full-time";
const t = text.toLowerCase();
if (t.includes("intern")) return "Internship";
if (t.includes("part")) return "Part-time";
if (t.includes("contract")) return "Contract";
if (t.includes("trainee") || t.includes("graduate")) return "Graduate Trainee";
return "Full-time";
}

function inferInternship(job) {
const title = (job.title || "").toLowerCase();
return title.includes("intern");
}

function normalizeCountyFromLocation(location) {
if (!location) return "Nationwide";

const locationText =
typeof location === "string"
? location
: location.display_name || "";

const lower = locationText.toLowerCase();

for (const county of KENYA_COUNTIES) {
if (lower.includes(county.toLowerCase())) {
return county;
}
}

return "Nationwide";
}

function dedupeJobs(jobs) {
const seen = new Set();

return jobs.filter((job) => {
const key = job.applyUrl || `${job.title}-${job.company}-${job.location}`;

if (seen.has(key)) return false;

seen.add(key);
return true;
});
}

function getUserIp(req) {
const forwarded = req.headers["x-forwarded-for"];
if (forwarded) return forwarded.split(",")[0];
return req.socket?.remoteAddress || "";
}

async function fetchCareerjetJobs(pages, perPage, keyword, location, userIp, userAgent) {

if (!CAREERJET_API_KEY) {
console.error("Missing CAREERJET_API_KEY");
return [];
}

const jobs = [];

for (let page = 1; page <= pages; page++) {

const params = new URLSearchParams({
locale_code: CAREERJET_LOCALE,
sort: "date",
page: String(page),
page_size: String(perPage),
user_ip: userIp,
user_agent: userAgent
});

params.set("api_key", CAREERJET_API_KEY);

if (keyword) params.set("keywords", keyword);

if (location && location.toLowerCase() !== "nationwide") {
params.set("location", location);
}

const endpoint = `https://search.api.careerjet.net/v4/query?${params}`;

try {

const response = await fetch(endpoint);

if (!response.ok) {
console.error("Careerjet API error:", response.status);
break;
}

const data = await response.json();

if (!data || !data.jobs) break;

const mappedJobs = data.jobs.map((job, index) => {

const createdAt = job.date ? new Date(job.date) : null;

return {
id: `careerjet-${page}-${index}-${Date.now()}`,
title: job.title || "Untitled Job",
company: job.company || job.site || "Company",
location: job.locations || "Kenya",
applyUrl: job.url || "#",
createdAt,
deadline: createdAt
? new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
: null,
source: "Careerjet",
category: "General",
type: normalizeType(job.title),
description: job.description
? job.description.replace(/\s+/g, " ").slice(0, 150) + "..."
: "",
county: normalizeCountyFromLocation(job.locations),
isInternship: inferInternship(job)
};

});

jobs.push(...mappedJobs);

} catch (error) {

console.error("Careerjet fetch error:", error);
break;

}

}

return jobs;
}

export default async function handler(req, res) {

res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");

if (req.method === "OPTIONS") {
res.status(204).end();
return;
}

if (req.method !== "GET") {
res.status(405).json({ error: "Method not allowed" });
return;
}

const pages = Math.min(5, Math.max(1, Number(req.query.pages || JOBS_PAGES)));
const perPage = Math.min(50, Math.max(10, Number(req.query.perPage || JOBS_RESULTS_PER_PAGE)));

const keyword =
typeof req.query.q === "string"
? req.query.q.trim()
: "";

const location =
typeof req.query.county === "string"
? req.query.county.trim()
: "";

const userIp = getUserIp(req);

const userAgent =
req.headers["user-agent"] || CAREERJET_USER_AGENT;

const careerjetJobs = await fetchCareerjetJobs(
pages,
perPage,
keyword,
location,
userIp,
userAgent
);

const jobs = dedupeJobs(careerjetJobs);

console.log(`Fetched ${jobs.length} jobs from Careerjet`);

res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

res.status(200).json({ jobs });

}
