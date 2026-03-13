import { db, firebaseReady, collection, getDocs } from "./firebase.js";

// Job listings: fetch from Careerjet + Firestore, then filter on the client.

const env = window.__ENV__ || {};
const CAREERJET_API_KEY = env.CAREERJET_API_KEY || env.CAREERJET_PUBLISHER_KEY;
const CAREERJET_LOCALE = env.CAREERJET_LOCALE || "en_KE";
const CAREERJET_USER_IP = env.CAREERJET_USER_IP;
const CAREERJET_ENDPOINT = "https://search.api.careerjet.net/v4/query";
const USE_SERVER_API =
  env.USE_SERVER_API === undefined
    ? true
    : String(env.USE_SERVER_API).toLowerCase() === "true";
const FETCH_CAREERJET_DIRECT = String(env.FETCH_CAREERJET_DIRECT).toLowerCase() === "true";
const JOBS_API_ENDPOINT = env.JOBS_API_ENDPOINT || "/api/jobs";
const JOBS_PAGES = Math.max(1, Number(env.JOBS_PAGES || 2));
const JOBS_RESULTS_PER_PAGE = Math.max(10, Number(env.JOBS_RESULTS_PER_PAGE || 30));

const jobsList = document.getElementById("jobsList");
const status = document.getElementById("jobsStatus");
const refreshBtn = document.getElementById("refreshJobs");

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const countyFilter = document.getElementById("countyFilter");
const applyFiltersBtn = document.getElementById("applyFilters");
const clearFiltersBtn = document.getElementById("clearFilters");
const filterStatus = document.getElementById("filterStatus");

let allJobs = [];
let cachedUserIp = "";

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

const DEFAULT_CATEGORIES = [
  "Administration",
  "Agriculture",
  "Construction",
  "Customer Service",
  "Education",
  "Engineering",
  "Finance",
  "Healthcare",
  "Hospitality",
  "Human Resources",
  "IT & Software",
  "Legal",
  "Logistics",
  "Marketing",
  "NGO & Non-profit",
  "Retail",
  "Sales",
  "Science",
  "Security",
  "Supply Chain"
];

const TYPE_FILTERS = [
  "Internship",
  "Graduate Trainee",
  "Full-time",
  "Part-time",
  "Contract"
];

// Update the status text under the page header
function setStatus(message) {
  status.textContent = message;
}

function setFilterStatus(message) {
  filterStatus.textContent = message;
}

function formatDate(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return "No deadline listed";
  }
  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
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

function inferInternship(job) {
  const title = (job.title || "").toLowerCase();
  const type = (job.type || "").toLowerCase();
  return title.includes("intern") || type.includes("intern");
}

function createJobCard(job) {
  const card = document.createElement("div");
  card.className = "card job-card";

  const tagRow = document.createElement("div");
  tagRow.className = "job-tags";

  if (job.county) {
    const countyTag = document.createElement("div");
    countyTag.className = "tag tag-county";
    countyTag.textContent = job.county;
    tagRow.appendChild(countyTag);
  }

  if (job.isInternship) {
    const internTag = document.createElement("div");
    internTag.className = "tag tag-highlight";
    internTag.textContent = "Internship";
    tagRow.appendChild(internTag);
  }

  if (job.category) {
    const categoryTag = document.createElement("div");
    categoryTag.className = "tag";
    categoryTag.textContent = job.category;
    tagRow.appendChild(categoryTag);
  }

  if (job.type) {
    const typeTag = document.createElement("div");
    typeTag.className = "tag";
    typeTag.textContent = job.type;
    tagRow.appendChild(typeTag);
  }

  const title = document.createElement("h3");
  title.textContent = job.title;

  const meta = document.createElement("p");
  meta.className = "job-meta";
  meta.textContent = `${job.company} | ${job.location}${job.county ? ` | ${job.county}` : ""}`;

  const deadline = document.createElement("p");
  deadline.className = "job-meta";
  deadline.textContent = `Apply by: ${formatDate(job.deadline)}`;

  const link = document.createElement("a");
  link.href = job.applyUrl || "#";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Apply now";

  card.append(tagRow, title, meta, deadline);

  if (job.description) {
    const description = document.createElement("p");
    description.className = "helper";
    description.textContent = job.description;
    card.appendChild(description);
  }

  card.appendChild(link);
  return card;
}

function buildApiUrl(filters = {}) {
  try {
    const url = new URL(JOBS_API_ENDPOINT, window.location.origin);
    url.searchParams.set("pages", String(JOBS_PAGES));
    url.searchParams.set("perPage", String(JOBS_RESULTS_PER_PAGE));
    if (filters.query) {
      url.searchParams.set("q", filters.query);
    }
    if (filters.county) {
      url.searchParams.set("county", filters.county);
    }
    return url.toString();
  } catch (error) {
    return JOBS_API_ENDPOINT;
  }
}

async function fetchServerJobs(filters = {}) {
  try {
    const response = await fetch(buildApiUrl(filters), { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Server API request failed.");
    }
    const data = await response.json();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    return jobs;
  } catch (error) {
    console.warn("Server API not available. Falling back to direct API calls.");
    return [];
  }
}

function buildBasicAuthHeader(apiKey) {
  try {
    return `Basic ${btoa(`${apiKey}:`)}`;
  } catch (error) {
    return "";
  }
}

async function resolveUserIp() {
  if (CAREERJET_USER_IP) {
    return CAREERJET_USER_IP;
  }
  if (cachedUserIp) {
    return cachedUserIp;
  }
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    if (!response.ok) {
      throw new Error("IP lookup failed");
    }
    const data = await response.json();
    cachedUserIp = data.ip || "";
    return cachedUserIp;
  } catch (error) {
    console.warn("Unable to resolve user IP for Careerjet.");
    return "";
  }
}

// Fetch jobs from Careerjet API
async function fetchCareerjetJobs(filters = {}) {
  if (!CAREERJET_API_KEY) {
    return [];
  }

  const userIp = await resolveUserIp();
  if (!userIp) {
    setStatus("Careerjet needs a user IP. Add CAREERJET_USER_IP in env.js if needed.");
    return [];
  }

  const authHeader = buildBasicAuthHeader(CAREERJET_API_KEY);
  if (!authHeader) {
    return [];
  }

  const jobs = [];
  const totalPages = Math.min(5, JOBS_PAGES);
  const keyword = filters.query ? filters.query.trim() : "";
  const county = filters.county ? filters.county.trim() : "";

  for (let page = 1; page <= totalPages; page += 1) {
    const params = new URLSearchParams({
      locale_code: CAREERJET_LOCALE,
      sort: "date",
      page: String(page),
      page_size: String(JOBS_RESULTS_PER_PAGE),
      fragment_size: "140",
      user_ip: userIp,
      user_agent: navigator.userAgent
    });

    if (keyword) {
      params.set("keywords", keyword);
    }
    if (county && county.toLowerCase() !== "nationwide") {
      params.set("location", county);
    }

    try {
      const response = await fetch(`${CAREERJET_ENDPOINT}?${params.toString()}`, {
        headers: {
          Authorization: authHeader
        }
      });
      if (!response.ok) {
        throw new Error("Careerjet request failed.");
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
    } catch (error) {
      console.error(error);
      break;
    }
  }

  return jobs;
}

// Fetch admin-approved jobs from Firestore
async function fetchManualJobs() {
  if (!firebaseReady || !db) {
    return [];
  }
  const snapshot = await getDocs(collection(db, "jobs"));
  const jobs = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.approved) {
      const deadline = data.deadline?.toDate
        ? data.deadline.toDate()
        : data.deadline
          ? new Date(data.deadline)
          : null;
      const createdAt = data.createdAt?.toDate
        ? data.createdAt.toDate()
        : data.createdAt
          ? new Date(data.createdAt)
          : data.updatedAt?.toDate
            ? data.updatedAt.toDate()
            : data.updatedAt
              ? new Date(data.updatedAt)
              : null;
      const normalized = {
        id: docSnap.id,
        title: data.title,
        company: data.company,
        location: data.location,
        applyUrl: data.applyUrl,
        deadline,
        createdAt,
        source: data.source || "Admin",
        category: data.category || "General",
        type: data.type || "Full-time",
        description: data.description || "",
        county: data.county || normalizeCountyFromLocation(data.location)
      };
      normalized.isInternship = inferInternship(normalized);
      jobs.push(normalized);
    }
  });
  return jobs;
}

function populateCountyFilter() {
  countyFilter.innerHTML = "<option value=\"\">All counties</option>";
  const nationwideOption = document.createElement("option");
  nationwideOption.value = "Nationwide";
  nationwideOption.textContent = "Nationwide";
  countyFilter.appendChild(nationwideOption);

  KENYA_COUNTIES.forEach((county) => {
    const option = document.createElement("option");
    option.value = county;
    option.textContent = county;
    countyFilter.appendChild(option);
  });
}

// Build the filter dropdowns based on available data
function populateFilters(jobs) {
  const categories = new Set();

  DEFAULT_CATEGORIES.forEach((category) => categories.add(category));

  jobs.forEach((job) => {
    if (job.category) {
      categories.add(job.category);
    }
  });

  categoryFilter.innerHTML = "<option value=\"\">All categories</option>";

  TYPE_FILTERS.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    categoryFilter.appendChild(option);
  });

  [...categories].sort().forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });
}

// Render the final job cards
function renderJobs(jobs) {
  jobsList.innerHTML = "";
  if (!jobs.length) {
    setStatus("No jobs match your filters yet.");
    return;
  }
  jobs.forEach((job) => {
    jobsList.appendChild(createJobCard(job));
  });
  setStatus(`Showing ${jobs.length} opportunities.`);
}

// Apply search and filter settings
function applyFilters() {
  const search = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const county = countyFilter.value;

  let filtered = allJobs.filter((job) => {
    const matchesSearch =
      !search ||
      [job.title, job.company, job.location, job.category, job.description, job.county]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(search));

    let matchesCategory = true;
    if (category) {
      if (TYPE_FILTERS.includes(category)) {
        matchesCategory =
          job.type === category || (category === "Internship" && job.isInternship);
      } else {
        matchesCategory = job.category === category;
      }
    }
    const matchesCounty = !county || job.county === county;

    return matchesSearch && matchesCategory && matchesCounty;
  });

  filtered = filtered.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  renderJobs(filtered);
  setFilterStatus(`Filtered to ${filtered.length} listings.`);
}

// Reset all filter fields to default
function clearFilters() {
  searchInput.value = "";
  categoryFilter.value = "";
  countyFilter.value = "";
  loadJobs();
}

// Load everything (Careerjet + manual jobs)
async function loadJobs(filters = {}) {
  setStatus("Loading listings...");
  jobsList.innerHTML = "";
  populateCountyFilter();
  populateFilters([]);

  const manualJobsPromise = fetchManualJobs();
  let apiJobs = [];

  if (USE_SERVER_API && JOBS_API_ENDPOINT) {
    apiJobs = await fetchServerJobs(filters);
  }

  let careerjetJobs = [];

  if (!apiJobs.length && FETCH_CAREERJET_DIRECT) {
    careerjetJobs = await fetchCareerjetJobs(filters);
  }

  const manualJobs = await manualJobsPromise;

  allJobs = [...manualJobs, ...(apiJobs.length ? apiJobs : careerjetJobs)];
  if (!allJobs.length) {
    setStatus("");
    setFilterStatus("");
    return;
  }

  populateFilters(allJobs);
  applyFilters();
}

refreshBtn.addEventListener("click", () => loadJobs());
applyFiltersBtn.addEventListener("click", () =>
  loadJobs({
    query: searchInput.value.trim(),
    county: countyFilter.value
  })
);
clearFiltersBtn.addEventListener("click", clearFilters);

[searchInput, categoryFilter, countyFilter].forEach((el) => {
  el.addEventListener("input", applyFilters);
  el.addEventListener("change", applyFilters);
});

loadJobs();
