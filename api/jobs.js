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

for (const county of KENYA_COUNTIES) {
if (lower.includes(county.toLowerCase())) {
return county;
}
}

return "Nationwide";
}

function dedupeJobs(jobs) {
const seen = new Set();

return jobs.filter(job => {
const key = job.applyUrl;

if (seen.has(key)) return false;

seen.add(key);
return true;
});
}

function getUserIp(req) {

const forwarded = req.headers["x-forwarded-for"];

if (forwarded) {
return forwarded.split(",")[0];
}

return req.socket?.remoteAddress || "8.8.8.8"; // fallback
}

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
page: page,
page_size: perPage,
sort: "date",
user_ip: userIp,
user_agent: CAREERJET_USER_AGENT
});

if (keyword) params.set("keywords", keyword);

if (location) params.set("location", location);

const endpoint = `https://search.api.careerjet.net/v4/query?${params}`;

try {

const response = await fetch(endpoint, {
headers: {
"User-Agent": CAREERJET_USER_AGENT
}
});

if (!response.ok) {
console.error("Careerjet API error:", response.status);
break;
}

const data = await response.json();

if (!data || !data.jobs) break;

const mapped = data.jobs.map((job, index) => {

const createdAt = job.date ? new Date(job.date) : null;

return {
id: `careerjet-${page}-${index}`,
title: job.title || "Untitled Job",
company: job.company || job.site || "Company",
location: job.locations || "Kenya",
applyUrl: job.url || "#",
createdAt,
deadline: createdAt
? new Date(createdAt.getTime() + 30*24*60*60*1000)
: null,
source: "Careerjet",
type: normalizeType(job.title),
description: job.description
? job.description.replace(/\s+/g," ").slice(0,150) + "..."
: "",
county: normalizeCounty(job.locations)
};

});

jobs.push(...mapped);

} catch (err) {

console.error("Careerjet fetch error:", err);

}

}

return jobs;
}

export default async function handler(req,res){

res.setHeader("Access-Control-Allow-Origin","*");
res.setHeader("Access-Control-Allow-Methods","GET,OPTIONS");

if(req.method === "OPTIONS"){
return res.status(200).end();
}

const pages = Number(req.query.pages) || 2;
const perPage = Number(req.query.perPage) || 30;
const keyword = req.query.q || "";
const location = req.query.county || "";

const userIp = getUserIp(req);

try {

const jobs = await fetchCareerjetJobs(
pages,
perPage,
keyword,
location,
userIp
);

const cleanJobs = dedupeJobs(jobs);

return res.status(200).json({
total: cleanJobs.length,
jobs: cleanJobs
});

} catch (error) {

console.error(error);

return res.status(500).json({
error: "Failed to fetch jobs"
});

}

}
