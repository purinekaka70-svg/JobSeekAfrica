// js/jobs.js
if (typeof window !== "undefined") {
  window.__JOBS_BOOTSTRAPPED__ = true;
}
import {
  auth,
  db,
  firebaseReady,
  getAuthMetadata,
  onAuthChange,
  recordPayment,
  signInUser,
  signUpUser,
  signOutUser,
  verifyPaymentAccess,
  collection,
  addDoc,
  setDoc,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "./firebase.js";

const jobsList = document.getElementById("jobsList");
const countyFilter = document.getElementById("countyFilter");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const applyFilters = document.getElementById("applyFilters");
const clearFilters = document.getElementById("clearFilters");
const refreshJobs = document.getElementById("refreshJobs");
const jobsStatus = document.getElementById("jobsStatus");
const filterStatus = document.getElementById("filterStatus");
const postJobForm = document.getElementById("postJobForm");
const postJobMessage = document.getElementById("postJobMessage");
const postJobCounty = document.getElementById("postJobCounty");
const postJobAuth = document.getElementById("postJobAuth");
const postJobLoginForm = document.getElementById("postJobLoginForm");
const postJobLoginName = document.getElementById("postJobLoginName");
const postJobLoginEmail = document.getElementById("postJobLoginEmail");
const postJobLoginPassword = document.getElementById("postJobLoginPassword");
const postJobLoginStatus = document.getElementById("postJobLoginStatus");
const postJobLogout = document.getElementById("postJobLogout");
const postJobCreateAccount = document.getElementById("postJobCreateAccount");
const smartApplyForm = document.getElementById("smartApplyForm");
const smartApplyMeta = document.getElementById("smartApplyMeta");
const smartApplyFullName = document.getElementById("smartApplyFullName");
const smartApplyEmail = document.getElementById("smartApplyEmail");
const smartApplyPhone = document.getElementById("smartApplyPhone");
const smartApplyPitch = document.getElementById("smartApplyPitch");
const smartApplyStatus = document.getElementById("smartApplyStatus");
const smartApplyCancel = document.getElementById("smartApplyCancel");
const smartApplicationList = document.getElementById("smartApplicationList");
const refreshApplicationsBtn = document.getElementById("refreshApplications");
const env = window.__ENV__ || {};
const LOCAL_CV_PROFILE_KEY = "jobseekafrica_cv_profile";
const JOB_POSTING_PRICE = 500;
const MATCH_UPGRADE_PRICE = 200;
const CV_OPTIMIZATION_PRICE = 300;
const COVER_LETTER_PRICE = 300;
const MATCH_TARGET_SCORE = 90;
const APPLICATION_REFRESH_MS = 45000;
const APPLICATION_STATUS_LABELS = {
  submitted: "Submitted",
  under_review: "Under Review",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected"
};
const STUDENT_KEYWORD_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "your",
  "will",
  "have",
  "into",
  "role",
  "jobs",
  "job",
  "work",
  "kenya",
  "student",
  "fresh",
  "graduate"
]);

const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu",
  "Garissa","Homa Bay","Isiolo","Kajiado","Kakamega","Kericho",
  "Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu","Kitui","Kwale",
  "Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit",
  "Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru",
  "Nandi","Narok","Nyamira","Nyandarua","Nyeri","Samburu",
  "Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia",
  "Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
];
const COUNTY_ALIASES = {
  "nairobi": "Nairobi",
  "mombasa": "Mombasa",
  "kisumu": "Kisumu",
  "nakuru": "Nakuru",
  "eldoret": "Uasin Gishu",
  "thika": "Kiambu",
  "ruiru": "Kiambu",
  "juja": "Kiambu",
  "kitale": "Trans Nzoia",
  "malindi": "Kilifi",
  "diani": "Kwale",
  "voi": "Taita-Taveta",
  "taveta": "Taita-Taveta",
  "nyahururu": "Laikipia",
  "nanyuki": "Laikipia"
};

const CAREERJET_PAGES = Math.min(20, Math.max(1, Number(env.CAREERJET_PAGES || 10)));
const CAREERJET_PAGE_SIZE = Math.min(50, Math.max(10, Number(env.CAREERJET_PAGE_SIZE || 50)));
const CAREERJET_MAX_JOBS = Math.min(2000, Math.max(100, Number(env.CAREERJET_MAX_JOBS || 500)));
const CAREERJET_FALLBACK_KEYWORD = String(env.CAREERJET_FALLBACK_KEYWORD || "driver").trim();

// Populate counties dropdown
if (countyFilter) {
  KENYA_COUNTIES.forEach(county => {
    const opt = document.createElement("option");
    opt.value = county;
    opt.textContent = county;
    countyFilter.appendChild(opt);
  });
}

if (postJobCounty) {
  const nationwide = document.createElement("option");
  nationwide.value = "Nationwide";
  nationwide.textContent = "Nationwide";
  postJobCounty.appendChild(nationwide);
  KENYA_COUNTIES.forEach(county => {
    const opt = document.createElement("option");
    opt.value = county;
    opt.textContent = county;
    postJobCounty.appendChild(opt);
  });
}

let allJobs = [];
let displayedJobs = [];
let activeJobs = null;
const JOBS_PER_LOAD = Math.min(
  300,
  Math.max(50, Number(env.JOBS_PER_LOAD || 300))
);
let jobsPerLoad = JOBS_PER_LOAD;
let loadIndex = 0;
let observer = null;
let sentinel = null;
let lastCareerjetError = "";
let filterDebounce = null;
let currentSmartApplyJob = null;

function safeStorage() {
  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

function readStoredCvProfile() {
  const storage = safeStorage();
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(LOCAL_CV_PROFILE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function tokenizeStudentText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2 && !STUDENT_KEYWORD_STOP_WORDS.has(part));
}

function isStudentRole(job) {
  const type = String(job?.type || "").toLowerCase();
  return (
    type.includes("intern") ||
    type.includes("attachment") ||
    type.includes("graduate") ||
    type.includes("entry")
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCvMatch(job) {
  const cvProfile = readStoredCvProfile();
  if (!cvProfile) {
    return {
      score: 40,
      hasProfile: false,
      targetScore: MATCH_TARGET_SCORE
    };
  }

  const cvTerms = new Set(
    tokenizeStudentText(
      [
        cvProfile.fullName,
        cvProfile.skills,
        cvProfile.education,
        cvProfile.experience
      ]
        .flat()
        .join(" ")
    )
  );
  const jobTerms = new Set(
    tokenizeStudentText(
      [
        job.title,
        job.company,
        job.category,
        job.type,
        job.description,
        job.location,
        job.county
      ].join(" ")
    )
  );

  let overlap = 0;
  jobTerms.forEach((term) => {
    if (cvTerms.has(term)) {
      overlap += 1;
    }
  });

  const denominator = Math.max(3, Math.min(jobTerms.size || 1, 10));
  const ratio = overlap / denominator;
  const studentBonus = isStudentRole(job) ? 8 : 0;
  const score = clamp(Math.round(38 + ratio * 50 + studentBonus), 40, 92);

  return {
    score,
    hasProfile: true,
    targetScore: MATCH_TARGET_SCORE
  };
}

function buildPageUrl(path, params) {
  const url = new URL(path, window.location.href);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value).trim());
    }
  });
  return url.toString();
}

function getLetterTemplateType(job) {
  if (job.type === "Internship" || job.type === "Attachment") {
    return "internship";
  }
  if (job.type === "Graduate Trainee") {
    return "graduate";
  }
  if (job.type === "Entry-level") {
    return "entry";
  }
  return "cover";
}

function buildCvUpgradeUrl(job) {
  return buildPageUrl("cvbuilder.html", {
    jobTitle: job.title,
    company: job.company,
    jobType: job.type,
    applyUrl: job.applyUrl,
    price: MATCH_UPGRADE_PRICE,
    service: "match_upgrade",
    targetScore: MATCH_TARGET_SCORE
  });
}

function buildCvOptimizationUrl(job) {
  return buildPageUrl("cvbuilder.html", {
    jobTitle: job.title,
    company: job.company,
    jobType: job.type,
    applyUrl: job.applyUrl,
    price: CV_OPTIMIZATION_PRICE,
    service: "cv_optimization",
    targetScore: MATCH_TARGET_SCORE
  });
}

function buildCoverLetterUrl(job) {
  return buildPageUrl("coverletter.html", {
    jobTitle: job.title,
    company: job.company,
    jobType: job.type,
    applyUrl: job.applyUrl,
    price: COVER_LETTER_PRICE,
    service: "tailored_cover_letter",
    templateType: getLetterTemplateType(job)
  });
}

function isCareerjetSource(job) {
  return String(job?.source || "").toLowerCase().includes("careerjet");
}

function canSmartApply(job) {
  return Boolean(job?.fromFirestore && !isCareerjetSource(job));
}

function getApplicationStatusLabel(status) {
  return APPLICATION_STATUS_LABELS[String(status || "").trim()] || "Submitted";
}

function setSmartApplyStatus(message, isError = false) {
  if (!smartApplyStatus) {
    return;
  }
  smartApplyStatus.textContent = message;
  smartApplyStatus.style.color = isError ? "#b42318" : "";
}

function renderApplicationEmpty(message) {
  if (!smartApplicationList) {
    return;
  }
  smartApplicationList.innerHTML = "";
  const empty = document.createElement("p");
  empty.className = "helper";
  empty.textContent = message;
  smartApplicationList.appendChild(empty);
}

function formatApplicationDate(value) {
  if (!value) {
    return "Just now";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }
  return date.toLocaleString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function prefillSmartApplyFields(job) {
  const profile = readStoredCvProfile() || {};
  if (smartApplyFullName && !smartApplyFullName.value.trim()) {
    smartApplyFullName.value = profile.fullName || "";
  }
  if (smartApplyEmail && !smartApplyEmail.value.trim()) {
    smartApplyEmail.value = profile.email || auth?.currentUser?.email || "";
  }
  if (smartApplyPhone && !smartApplyPhone.value.trim()) {
    smartApplyPhone.value = profile.phone || "";
  }
  if (smartApplyPitch && !smartApplyPitch.value.trim()) {
    smartApplyPitch.value = job
      ? `I am interested in the ${job.title} role at ${job.company}. I have relevant skills and I am ready to move quickly.`
      : "";
  }
}

function openSmartApply(job) {
  if (!smartApplyForm) {
    return;
  }
  currentSmartApplyJob = job;
  smartApplyForm.hidden = false;
  const match = getCvMatch(job);
  if (smartApplyMeta) {
    smartApplyMeta.textContent = `${job.title} at ${job.company} | ${getDisplayLocation(job)} | CV match ${match.score}%`;
  }
  setSmartApplyStatus("");
  prefillSmartApplyFields(job);
  smartApplyForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeSmartApply() {
  currentSmartApplyJob = null;
  if (smartApplyForm) {
    smartApplyForm.hidden = true;
  }
  setSmartApplyStatus("");
}

function renderSmartApplications(applications) {
  if (!smartApplicationList) {
    return;
  }
  smartApplicationList.innerHTML = "";
  if (!applications.length) {
    renderApplicationEmpty("No smart applications yet.");
    return;
  }

  applications.forEach((application) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <h4>${application.jobTitle || "Job Application"}</h4>
      <p class="helper">${application.company || "Company"} | ${application.location || application.county || "Kenya"}</p>
      <p class="helper"><strong>Status:</strong> ${getApplicationStatusLabel(application.status)}</p>
      <p class="helper"><strong>Updated:</strong> ${formatApplicationDate(application.updatedAt || application.createdAt)}</p>
      <p class="helper">${application.statusMessage || "We received your smart application and will post updates here."}</p>
      ${
        application.applyUrl
          ? `<a href="${application.applyUrl}" target="_blank" rel="noopener noreferrer" class="read-more">Open job listing</a>`
          : ""
      }
    `;
    smartApplicationList.appendChild(item);
  });
}

async function loadSmartApplications() {
  if (!smartApplicationList) {
    return;
  }
  if (!firebaseReady || !db) {
    renderApplicationEmpty("Smart applications are unavailable until Firebase is configured.");
    return;
  }

  try {
    const authMeta = await getAuthMetadata();
    const snapshot = await getDocs(
      query(collection(db, "applications"), where("uid", "==", authMeta.uid))
    );
    const applications = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt;
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
      applications.push({
        id: docSnap.id,
        ...data,
        updatedAt,
        createdAt
      });
    });
    applications.sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
    renderSmartApplications(applications);
  } catch (error) {
    console.error("Smart applications fetch error:", error);
    renderApplicationEmpty("Unable to load smart application updates right now.");
  }
}

function setPostJobLoginStatus(message, isError = false) {
  if (!postJobLoginStatus) return;
  postJobLoginStatus.textContent = message;
  postJobLoginStatus.style.color = isError ? "#b42318" : "";
}

function isEmailUser(user) {
  return Boolean(user && !user.isAnonymous && user.email);
}

function updatePostJobAuthUI(user) {
  if (!postJobForm || !postJobLoginForm) {
    return;
  }
  const signedIn = isEmailUser(user);
  postJobForm.style.display = signedIn ? "block" : "none";
  if (postJobLoginEmail) {
    postJobLoginEmail.disabled = signedIn;
    postJobLoginEmail.value = signedIn ? user.email : "";
  }
  if (postJobLoginName) {
    postJobLoginName.disabled = signedIn;
  }
  if (postJobLoginPassword) {
    postJobLoginPassword.disabled = signedIn;
    postJobLoginPassword.value = "";
  }
  if (!signedIn && postJobLoginName) {
    postJobLoginName.value = "";
  }
  if (postJobCreateAccount) {
    postJobCreateAccount.hidden = signedIn;
  }
  if (postJobLogout) {
    postJobLogout.hidden = !signedIn;
  }
  if (signedIn) {
    setPostJobLoginStatus(
      `Signed in as ${user.email}. Pay KES ${JOB_POSTING_PRICE} and submit your company job.`
    );
  } else {
    setPostJobLoginStatus("Sign in, pay KES 500, and submit your company job listing.");
  }
}

function setControlsEnabled(enabled) {
  const controls = [
    searchInput,
    categoryFilter,
    countyFilter,
    applyFilters,
    clearFilters,
    refreshJobs
  ];
  controls.forEach(control => {
    if (control) {
      control.disabled = !enabled;
    }
  });
}

function normalizeMpesaRef(value) {
  return String(value || "").trim();
}

function lockJobs(message) {
  setControlsEnabled(true);
  if (jobsStatus) {
    jobsStatus.textContent = message;
  }
  if (filterStatus) {
    filterStatus.textContent = "";
  }
  if (jobsList) {
    jobsList.innerHTML = "";
  }
  allJobs = [];
  activeJobs = null;
  displayedJobs = [];
  loadIndex = 0;
}

// Normalize job type
function normalizeType(text) {
  if (!text) return "Full-time";
  const t = text.toLowerCase();
  if (t.includes("attachment")) return "Attachment";
  if (t.includes("intern")) return "Internship";
  if (t.includes("entry") || t.includes("fresh graduate") || t.includes("junior")) {
    return "Entry-level";
  }
  if (t.includes("part")) return "Part-time";
  if (t.includes("contract")) return "Contract";
  if (t.includes("graduate") || t.includes("trainee")) return "Graduate Trainee";
  return "Full-time";
}

// Normalize county
function detectCounty(text) {
  if (!text) return "";
  const lower = text.toLowerCase().replace(" county", "");
  for (const county of KENYA_COUNTIES) {
    if (lower.includes(county.toLowerCase())) return county;
  }
  for (const [alias, county] of Object.entries(COUNTY_ALIASES)) {
    if (lower.includes(alias)) return county;
  }
  const parts = lower.split(/[|,\/\-]/).map((part) => part.trim());
  for (const part of parts) {
    if (!part) continue;
    for (const county of KENYA_COUNTIES) {
      if (part.includes(county.toLowerCase())) return county;
    }
    for (const [alias, county] of Object.entries(COUNTY_ALIASES)) {
      if (part.includes(alias)) return county;
    }
  }
  return "";
}

function normalizeCounty(location, fallbackText = "") {
  if (location) {
    const match = detectCounty(location);
    if (match) return match;
  }
  if (fallbackText) {
    const match = detectCounty(fallbackText);
    if (match) return match;
  }
  return "Nationwide";
}

// Remove duplicates based on applyUrl
function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    const key = job.applyUrl || `${job.title || ""}|${job.company || ""}|${job.location || ""}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeApplyUrl(url) {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (!trimmed) return "";
  if (trimmed === "#") return "";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("mailto:") || lower.startsWith("tel:")) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return "";
  }
  if (trimmed.startsWith("/")) {
    return "";
  }
  return `https://${trimmed}`;
}

function buildSearchText(job) {
  return [
    job.title,
    job.company,
    job.category,
    job.description,
    job.location,
    job.county,
    job.type,
    job.source
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getDisplayLocation(job) {
  const countyRaw = String(job.county || "").trim();
  if (countyRaw && countyRaw.toLowerCase() !== "nationwide") {
    return countyRaw;
  }
  const location = String(job.location || "").trim();
  const derived = detectCounty(location);
  if (derived) {
    return derived;
  }
  if (location && !["kenya", "nationwide"].includes(location.toLowerCase())) {
    return location;
  }
  return "Unknown County";
}

function getLocationTag(job) {
  const countyRaw = String(job.county || "").trim();
  if (countyRaw && countyRaw.toLowerCase() !== "nationwide") {
    return countyRaw;
  }
  const location = String(job.location || "").trim();
  const derived = detectCounty(location);
  if (derived) {
    return derived;
  }
  if (location && !["kenya", "nationwide"].includes(location.toLowerCase())) {
    return location;
  }
  return "";
}

function enrichJob(job) {
  const normalizedType = normalizeType(job.type || job.title);
  const rawDescription = job.description ? String(job.description) : "";
  const normalizedCounty = normalizeCounty(
    job.county || job.location || job.locations,
    `${job.title || ""} ${rawDescription}`
  );
  const applyUrl = normalizeApplyUrl(job.applyUrl || job.url || job.redirect_url);
  const description = rawDescription ? rawDescription.replace(/\s+/g, " ").trim() : "";
  const trimmedDescription = description ? `${description.slice(0, 220)}${description.length > 220 ? "..." : ""}` : "";
  return {
    ...job,
    type: normalizedType,
    county: normalizedCounty,
    applyUrl,
    description: trimmedDescription,
    searchText: buildSearchText({
      ...job,
      type: normalizedType,
      county: normalizedCounty,
      description: trimmedDescription
    })
  };
}

function prepareJobs(jobs) {
  return jobs.map(enrichJob);
}

function hasActiveFilters() {
  return Boolean(
    (searchInput?.value || "").trim() ||
    (categoryFilter?.value || "").trim() ||
    (countyFilter?.value || "").trim()
  );
}

function updateFilterStatus(filteredCount) {
  if (!filterStatus) return;
  const total = allJobs.length;
  if (!total) {
    filterStatus.textContent = "";
    return;
  }
  if (filteredCount === null) {
    filterStatus.textContent = `Showing all ${total} jobs.`;
    return;
  }
  filterStatus.textContent = `Showing ${filteredCount} of ${total} jobs.`;
}

function getApplyTarget() {
  const target = String(env.JOBS_APPLY_TARGET || "_blank").toLowerCase();
  return target === "_self" ? "_self" : "_blank";
}

function buildEndpoint(base, params) {
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}${params.toString()}`;
}

function getEndpointBases() {
  const bases = [
    env.CAREERJET_PROXY_ENDPOINT,
    "/api/careerjet",
    "/api/fetchJobs"
  ].filter(Boolean);
  return [...new Set(bases)];
}

function applyFallbackJobs(message) {
  if (!jobsList || !jobsStatus) {
    return;
  }
  jobsStatus.textContent = message;
  if (filterStatus) {
    filterStatus.textContent = "";
  }
  jobsList.innerHTML = "";

  allJobs = [];
  activeJobs = null;
  displayedJobs = [];
  loadIndex = 0;
  if (sentinel) {
    sentinel.remove();
    sentinel = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  const emptyCard = document.createElement("div");
  emptyCard.className = "job-card";
  emptyCard.innerHTML = `
    <h3>No jobs to show yet</h3>
    <p>${message}</p>
    <p>Try refreshing in a few minutes.</p>
  `;
  jobsList.appendChild(emptyCard);
}

// Fetch jobs via serverless proxy (avoids CORS + keeps API key private)
async function fetchFromCareerjetApi() {
  const endpointBases = getEndpointBases();
  const searchQuery = searchInput?.value?.trim();
  const perPage = CAREERJET_PAGE_SIZE;
  const pageCap = Math.ceil(CAREERJET_MAX_JOBS / perPage);
  const totalPages = Math.min(CAREERJET_PAGES, pageCap);
  const keywordBatches = searchQuery
    ? [searchQuery]
    : (CAREERJET_FALLBACK_KEYWORD ? [CAREERJET_FALLBACK_KEYWORD] : [""]);
  lastCareerjetError = "";

  const fetchBatches = async (keywords, pages) => {
    const jobs = [];
    for (const keyword of keywords) {
      for (let page = 1; page <= pages; page++) {
        const params = new URLSearchParams({
          q: keyword || "",
          page: page.toString(),
          pageSize: perPage.toString()
        });

        const locationFilter = countyFilter?.value;
        if (locationFilter) {
          params.set("location", locationFilter);
        }

        let pageLoaded = false;
        for (const endpointBase of endpointBases) {
          try {
            const endpoint = buildEndpoint(endpointBase, params);
            const response = await fetch(endpoint);

            if (!response.ok) {
              if (response.status === 404) {
                lastCareerjetError = "Careerjet API endpoint not found. Check CAREERJET_PROXY_ENDPOINT.";
                continue;
              }
              const responseClone = response.clone();
              let detail = "";
              try {
                const data = await response.json();
                detail = data?.details || data?.error || "";
              } catch (err) {
                try {
                  const text = await responseClone.text();
                  detail = text || "";
                } catch (e) {
                  detail = "";
                }
              }
              lastCareerjetError = `Careerjet API error (${response.status}).${detail ? " " + detail : ""}`;
              break;
            }

            const data = await response.json();
            if (!data.jobs || !Array.isArray(data.jobs) || data.jobs.length === 0) {
              pageLoaded = true;
              break;
            }
            jobs.push(...data.jobs);
            pageLoaded = true;
            if (jobs.length >= CAREERJET_MAX_JOBS) {
              return jobs.slice(0, CAREERJET_MAX_JOBS);
            }
            break;
          } catch (err) {
            lastCareerjetError = "Careerjet API failed. Check your API key or network.";
          }
        }

        if (!pageLoaded) {
          break;
        }
      }
    }
    return jobs;
  };

  const jobs = await fetchBatches(keywordBatches, totalPages);
  return dedupeJobs(jobs);
}

// Fetch jobs from Firestore (populated by Cloud Functions sync).
async function fetchFromFirestoreJobs() {
  if (!firebaseReady || !db) {
    return [];
  }
  try {
    const snapshot = await getDocs(
      query(collection(db, "jobs"), where("approved", "==", true))
    );
    const jobs = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() || {};
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
      const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt;
      jobs.push({
        id: docSnap.id,
        title: data.title || "Untitled Role",
        company: data.company || "Company",
        location: data.location || "Kenya",
        county: data.county || normalizeCounty(data.location),
        applyUrl: normalizeApplyUrl(data.applyUrl),
        type: normalizeType(data.type || data.title),
        category: data.category || "",
        contactEmail: data.contactEmail || "",
        postedByEmail: data.postedByEmail || "",
        fromFirestore: true,
        description: data.description ? String(data.description).slice(0, 200) + "..." : "",
        source: data.source || "Firestore",
        createdAt,
        updatedAt
      });
    });

    jobs.sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return dedupeJobs(jobs);
  } catch (error) {
    console.error("Firestore jobs fetch error:", error);
    return [];
  }
}

// Fetch jobs from Vercel API endpoint
async function fetchJobs() {
  if (!jobsList || !jobsStatus) {
    return;
  }
  jobsStatus.textContent = "Loading jobs...";
  jobsList.innerHTML = "";
  allJobs = [];
  displayedJobs = [];
  loadIndex = 0;

  try {
    console.log("Fetching jobs from Firestore...");
    const firestoreJobs = await fetchFromFirestoreJobs();
    let preparedJobs = [];
    if (firestoreJobs.length) {
      preparedJobs = prepareJobs(firestoreJobs);
    } else {
      console.log("Firestore empty, fetching from Careerjet...");
      const careerjetJobs = await fetchFromCareerjetApi();
      preparedJobs = prepareJobs(careerjetJobs);
    }
    allJobs = dedupeJobs(preparedJobs);

    if (!allJobs.length) {
      applyFallbackJobs(
        lastCareerjetError ||
          "No live jobs found yet. Check your Careerjet API key and try again."
      );
      return;
    }

    jobsStatus.textContent = `Total ${allJobs.length} jobs loaded.`;
    activeJobs = null;
    updateFilterStatus(null);
    if (hasActiveFilters()) {
      applyFiltersFunc();
    } else {
      renderNextBatch();
      initInfiniteScroll();
    }

  } catch (err) {
    console.error("Error fetching jobs:", err);
    applyFallbackJobs("Unable to load live jobs. Showing sample listings.");
  }
}

// Render jobs batch-wise to avoid freezing
function renderNextBatch() {
  if (!jobsList) {
    return;
  }
  const sourceJobs = activeJobs !== null ? activeJobs : allJobs;
  if (!sourceJobs.length) {
    return;
  }
  const nextBatch = sourceJobs.slice(loadIndex, loadIndex + jobsPerLoad);
  if (nextBatch.length && typeof window !== "undefined") {
    window.__JOBS_RENDERED__ = true;
  }
  nextBatch.forEach(job => {
    const div = document.createElement("div");
    div.className = "job-card";
    const isStudentListing = isStudentRole(job);
    const smartApplyEnabled = canSmartApply(job);
    if (isStudentListing) div.classList.add("highlight");
    const applyUrl = job.applyUrl || normalizeApplyUrl(job.url || job.redirect_url);
    const applyTarget = getApplyTarget();
    const match = getCvMatch(job);
    const smartApplyButton = smartApplyEnabled
      ? `<button type="button" class="btn btn-ghost" data-action="smart-apply" data-job-id="${job.id}">Smart Apply in JobSeekAfrica</button>`
      : "";
    const applyButton = `<a href="${buildCvUpgradeUrl(job)}" class="btn" aria-label="Apply with optimized CV for ${job.title}">Apply with optimized CV</a>`;
    const coverLetterButton = `<a href="${buildCoverLetterUrl(job)}" class="btn btn-secondary" aria-label="Generate tailored cover letter for ${job.title}">Tailored cover letter</a>`;
    const companyListingLink = applyUrl
      ? `<a href="${applyUrl}" target="${applyTarget}" rel="noopener noreferrer" class="job-source-link">Open company listing</a>`
      : `<span class="job-source-link muted">Listing link unavailable</span>`;
    if (applyUrl) {
      div.dataset.applyUrl = applyUrl;
      div.tabIndex = 0;
      div.setAttribute("role", "link");
      div.setAttribute("aria-label", `Open application for ${job.title}`);
    }
    const tags = [];
    if (job.type) {
      tags.push(
        `<span class="tag ${isStudentListing ? "tag-highlight" : ""}">${job.type}</span>`
      );
    }
    const locationTag = getLocationTag(job);
    if (locationTag) {
      tags.push(`<span class="tag tag-county">${locationTag}</span>`);
    }
    if (job.source) {
      tags.push(`<span class="tag">${job.source}</span>`);
    }
    if (isStudentListing) {
      tags.push(`<span class="tag">Students & Fresh Grads</span>`);
    }
    const tagsMarkup = tags.length ? `<div class="job-tags">${tags.join("")}</div>` : "";
    div.innerHTML = `
      ${tagsMarkup}
      <h3>${job.title}</h3>
      <p class="job-meta"><strong>Company:</strong> ${job.company}</p>
      <p class="job-meta"><strong>Location:</strong> ${getDisplayLocation(job)}</p>
      <p>${job.description || ""}</p>
      <div class="job-match-box">
        <p class="job-match-score"><strong>${match.hasProfile ? `Your CV is ${match.score}% match.` : "No saved CV yet. Start at 40% match."}</strong></p>
        <p class="helper">${match.score >= MATCH_TARGET_SCORE ? "Your profile is ready. Use the smart apply flow and then open the company listing." : `Improve to ${MATCH_TARGET_SCORE}% for KES ${MATCH_UPGRADE_PRICE}.`}</p>
      </div>
      <div class="job-action-stack">
        ${smartApplyButton}
        ${applyButton}
        ${coverLetterButton}
        ${companyListingLink}
      </div>
      <p class="helper">${smartApplyEnabled ? "Apply inside JobSeekAfrica and track live status updates from this page." : "Live in-site Smart Apply is available on direct company listings posted inside JobSeekAfrica."}</p>
      <p class="helper">Need a full rewrite? <a href="${buildCvOptimizationUrl(job)}">Optimize my CV for this job - KES ${CV_OPTIMIZATION_PRICE}</a></p>
    `;
    jobsList.appendChild(div);
    displayedJobs.push(job);
  });
  loadIndex += jobsPerLoad;

  if (loadIndex >= sourceJobs.length && observer) {
    observer.disconnect();
  }
}

function initInfiniteScroll() {
  if (!("IntersectionObserver" in window) || !jobsList) {
    return;
  }
  const sourceJobs = activeJobs !== null ? activeJobs : allJobs;
  if (!sourceJobs.length) {
    return;
  }
  if (observer) {
    observer.disconnect();
  }
  if (!sentinel) {
    sentinel = document.createElement("div");
    sentinel.id = "jobsSentinel";
    sentinel.className = "jobs-sentinel";
    jobsList.parentNode.appendChild(sentinel);
  }
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          renderNextBatch();
        }
      });
    },
    { root: null, rootMargin: "200px", threshold: 0.1 }
  );
  observer.observe(sentinel);
}

// Apply filters (API filters for search/location, client-side for category)
function applyFiltersFunc() {
  if (!searchInput || !categoryFilter || !countyFilter || !jobsList) {
    return;
  }
  if (!allJobs.length) {
    return;
  }
  const keyword = searchInput.value.toLowerCase().trim();
  const category = categoryFilter.value.trim();
  const county = countyFilter.value.trim();
  const hasFilters = Boolean(keyword || category || county);
  if (!hasFilters) {
    clearFiltersFunc();
    return;
  }

  // Filter jobs client-side for keyword, category, and county.
  const filtered = allJobs.filter(job => {
    const haystack = job.searchText || "";
    const matchKeyword = !keyword || haystack.includes(keyword);
    const matchCategory = !category || (job.type || "").toLowerCase() === category.toLowerCase();
    const countyValueSource =
      job.county && job.county.toLowerCase() !== "nationwide" ? job.county : job.location || "";
    const countyValue = countyValueSource.toLowerCase();
    const matchCounty = !county || countyValue.includes(county.toLowerCase());
    return matchKeyword && matchCategory && matchCounty;
  });

  // Update display
  jobsList.innerHTML = "";
  displayedJobs = [];
  loadIndex = 0;
  if (observer) {
    observer.disconnect();
  }
  if (sentinel) {
    sentinel.remove();
    sentinel = null;
  }

  // Show filtered jobs
  activeJobs = filtered;
  if (!filtered.length) {
    if (jobsStatus) {
      jobsStatus.textContent = "No jobs match your filters.";
    }
    updateFilterStatus(0);
    return;
  }
  renderNextBatch();
  initInfiniteScroll();
  updateFilterStatus(filtered.length);
  if (jobsStatus) {
    jobsStatus.textContent = `Total ${allJobs.length} jobs loaded.`;
  }
}

// Clear filters
function clearFiltersFunc() {
  if (!searchInput || !categoryFilter || !countyFilter || !jobsList) {
    return;
  }
  searchInput.value = "";
  categoryFilter.value = "";
  countyFilter.value = "";
  jobsList.innerHTML = "";
  displayedJobs = [];
  loadIndex = 0;
  if (observer) {
    observer.disconnect();
  }
  if (sentinel) {
    sentinel.remove();
    sentinel = null;
  }

  activeJobs = null;
  renderNextBatch();
  initInfiniteScroll();
  if (jobsStatus) {
    jobsStatus.textContent = `Total ${allJobs.length} jobs loaded.`;
  }
  updateFilterStatus(null);
}

// Event listeners
if (applyFilters) {
  applyFilters.addEventListener("click", applyFiltersFunc);
}
if (clearFilters) {
  clearFilters.addEventListener("click", clearFiltersFunc);
}
if (refreshJobs) {
  refreshJobs.addEventListener("click", fetchJobs);
}

function scheduleFilter() {
  if (filterDebounce) {
    clearTimeout(filterDebounce);
  }
  filterDebounce = setTimeout(() => {
    applyFiltersFunc();
  }, 250);
}

if (searchInput) {
  searchInput.addEventListener("input", scheduleFilter);
}
if (categoryFilter) {
  categoryFilter.addEventListener("change", scheduleFilter);
}
if (countyFilter) {
  countyFilter.addEventListener("change", scheduleFilter);
}

// Initial fetch
fetchJobs();

// Allow clicking the card to open the apply URL
if (jobsList) {
  jobsList.addEventListener("click", (event) => {
    const target = event.target;
    const smartApplyTrigger = target.closest("button[data-action='smart-apply']");
    if (smartApplyTrigger) {
      const jobId = smartApplyTrigger.dataset.jobId;
      const selectedJob = allJobs.find((job) => String(job.id || "") === String(jobId || ""));
      if (selectedJob) {
        openSmartApply(selectedJob);
      }
      return;
    }
    if (target.closest("a, button")) {
      return;
    }
    const card = target.closest(".job-card");
    if (!card || !card.dataset.applyUrl) {
      return;
    }
    const applyUrl = card.dataset.applyUrl;
    const applyTarget = getApplyTarget();
    if (applyTarget === "_self") {
      window.location.href = applyUrl;
    } else {
      window.open(applyUrl, "_blank", "noopener");
    }
  });

  jobsList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    const card = event.target.closest(".job-card");
    if (!card || !card.dataset.applyUrl) {
      return;
    }
    const applyUrl = card.dataset.applyUrl;
    const applyTarget = getApplyTarget();
    if (applyTarget === "_self") {
      window.location.href = applyUrl;
    } else {
      window.open(applyUrl, "_blank", "noopener");
    }
  });
}

// --- Public Job Posting Feature ---
async function handlePostJob(e) {
  e.preventDefault();

  const currentUser = auth?.currentUser || null;
  if (!isEmailUser(currentUser)) {
    if (postJobMessage) {
      postJobMessage.textContent = "Please sign in with email/password to post a job.";
      postJobMessage.style.color = "#b42318";
    }
    updatePostJobAuthUI(currentUser);
    return;
  }

  const formData = new FormData(postJobForm);
  const companyName = formData.get("company")?.trim() || "";
  const jobTitle = formData.get("title")?.trim() || "";
  const paymentPhone = formData.get("paymentPhone")?.trim() || "";
  const paymentRef = normalizeMpesaRef(formData.get("mpesaRef"));

  if (!firebaseReady || !db) {
    if (postJobMessage) postJobMessage.textContent = "Service unavailable (DB config missing).";
    return;
  }

  const btn = postJobForm.querySelector("button[type='submit']");
  if (btn) btn.disabled = true;
  if (postJobMessage) {
    postJobMessage.textContent = "Saving payment and submitting job...";
    postJobMessage.style.color = "";
  }

  try {
    if (!paymentPhone) {
      throw new Error("Enter the company M-Pesa phone number used for payment.");
    }
    if (!paymentRef) {
      throw new Error("Enter the M-Pesa reference for the KES 500 company posting fee.");
    }

    await recordPayment(paymentRef, "job_posting", {
      amount: JOB_POSTING_PRICE,
      phone: paymentPhone,
      company: companyName,
      jobTitle,
      metadata: {
        company: companyName,
        jobTitle,
        type: "company_posting_fee"
      }
    });

    const paymentAccess = await verifyPaymentAccess({
      requiredAmount: JOB_POSTING_PRICE,
      allowedSources: ["job_posting"]
    });
    if (!paymentAccess.ok) {
      throw new Error(
        paymentAccess.error || "Company posting payment not found. Save the M-Pesa reference first."
      );
    }

    const authMeta = await getAuthMetadata();
    const jobData = {
      title: jobTitle,
      company: companyName,
      location: formData.get("location")?.trim(),
      county: formData.get("county")?.trim() || "",
      type: formData.get("type") || "Graduate Trainee",
      category: formData.get("category") || "Students & Graduates",
      description: formData.get("description")?.trim(),
      applyUrl: normalizeApplyUrl(formData.get("applyUrl")?.trim()),
      contactEmail: formData.get("email")?.trim() || currentUser.email,
      postedByEmail: currentUser.email,
      approved: false,
      source: "Company Submission",
      paymentRef,
      paymentPhone,
      paymentAmount: JOB_POSTING_PRICE,
      paymentStatus: "submitted",
      uid: authMeta.uid,
      isAnonymous: authMeta.isAnonymous,
      authProvider: authMeta.authProvider,
      createdAt: serverTimestamp()
    };

    if (!jobData.county) {
      jobData.county = normalizeCounty(jobData.location);
    }

    if (!jobData.title || !jobData.company || !jobData.location || !jobData.applyUrl) {
      throw new Error("Job Title, Company, Location, and Apply Link are required.");
    }

    await addDoc(collection(db, "jobs"), jobData);

    if (postJobMessage) {
      postJobMessage.textContent =
        "Company job submitted with the KES 500 posting fee. It will appear after admin review.";
      postJobMessage.style.color = "#027a48";
    }
    postJobForm.reset();
  } catch (err) {
    console.error(err);
    if (postJobMessage) {
      postJobMessage.textContent = "Error: " + err.message;
      postJobMessage.style.color = "#b42318";
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function submitSmartApplication(event) {
  event.preventDefault();
  if (!smartApplyForm || !currentSmartApplyJob) {
    return;
  }
  if (!firebaseReady || !db) {
    setSmartApplyStatus("Smart application service is unavailable right now.", true);
    return;
  }

  const applicantName = smartApplyFullName?.value?.trim() || "";
  const applicantEmail = smartApplyEmail?.value?.trim() || "";
  const applicantPhone = smartApplyPhone?.value?.trim() || "";
  const pitch = smartApplyPitch?.value?.trim() || "";

  if (!applicantName || !applicantEmail || !applicantPhone || !pitch) {
    setSmartApplyStatus("Fill in your name, email, phone, and application pitch.", true);
    return;
  }

  const submitBtn = smartApplyForm.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = true;
  }
  setSmartApplyStatus("Submitting your smart application...");

  try {
    const authMeta = await getAuthMetadata();
    const match = getCvMatch(currentSmartApplyJob);
    const cvProfile = readStoredCvProfile();

    await addDoc(collection(db, "applications"), {
      jobId: currentSmartApplyJob.id || "",
      jobTitle: currentSmartApplyJob.title || "Job Application",
      company: currentSmartApplyJob.company || "Company",
      location: currentSmartApplyJob.location || currentSmartApplyJob.county || "Kenya",
      county: currentSmartApplyJob.county || "",
      applyUrl: currentSmartApplyJob.applyUrl || "",
      jobSource: currentSmartApplyJob.source || "JobSeekAfrica",
      companyContactEmail: currentSmartApplyJob.contactEmail || "",
      postedByEmail: currentSmartApplyJob.postedByEmail || "",
      applicantName,
      applicantEmail,
      applicantPhone,
      pitch,
      cvMatch: match.score,
      cvSnapshot: cvProfile || null,
      status: "submitted",
      statusMessage: "Application received. We will update this status inside JobSeekAfrica.",
      uid: authMeta.uid,
      isAnonymous: authMeta.isAnonymous,
      authProvider: authMeta.authProvider,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    setSmartApplyStatus(
      currentSmartApplyJob.applyUrl
        ? "Application submitted in JobSeekAfrica. Track updates below, then open the company listing to continue externally if needed."
        : "Application submitted in JobSeekAfrica. Track updates below."
    );
    await loadSmartApplications();
  } catch (error) {
    console.error("Smart apply error:", error);
    setSmartApplyStatus("Unable to submit your smart application right now.", true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
    }
  }
}

if (postJobForm) {
  postJobForm.addEventListener("submit", handlePostJob);
}

if (smartApplyForm) {
  smartApplyForm.addEventListener("submit", submitSmartApplication);
}

if (smartApplyCancel) {
  smartApplyCancel.addEventListener("click", closeSmartApply);
}

if (refreshApplicationsBtn) {
  refreshApplicationsBtn.addEventListener("click", loadSmartApplications);
}

if (postJobLoginForm) {
  postJobLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!postJobLoginEmail || !postJobLoginPassword) {
      return;
    }
    const email = postJobLoginEmail.value.trim();
    const password = postJobLoginPassword.value.trim();
    if (!email || !password) {
      setPostJobLoginStatus("Enter your email and password.", true);
      return;
    }
    setPostJobLoginStatus("Signing in...");
    try {
      const user = await signInUser(email, password);
      updatePostJobAuthUI(user);
      setPostJobLoginStatus("Signed in. Enter the KES 500 M-Pesa payment details and submit.");
    } catch (error) {
      const code = error?.code || "";
      const message =
        code === "auth/user-not-found"
          ? "User not found. Create an account in Firebase Auth."
          : code === "auth/wrong-password"
          ? "Incorrect password."
          : code === "auth/invalid-credential"
          ? "Invalid credentials."
          : code === "auth/invalid-email"
          ? "Invalid email address."
          : code === "auth/operation-not-allowed"
          ? "Email/Password auth is disabled in Firebase."
          : "Login failed. Check your credentials.";
      setPostJobLoginStatus(message, true);
    }
  });
}

if (postJobCreateAccount) {
  postJobCreateAccount.addEventListener("click", async () => {
    if (!postJobLoginEmail || !postJobLoginPassword) {
      return;
    }
    const email = postJobLoginEmail.value.trim();
    const password = postJobLoginPassword.value.trim();
    if (!email || !password) {
      setPostJobLoginStatus("Enter your email and password to create an account.", true);
      return;
    }
    setPostJobLoginStatus("Creating account...");
    try {
      const user = await signUpUser(email, password);
      if (firebaseReady && db) {
        const displayName = postJobLoginName?.value?.trim() || "";
        await setDoc(
          doc(db, "users", user.uid),
          {
            email: user.email,
            displayName,
            createdAt: serverTimestamp()
          },
          { merge: true }
        );
      }
      updatePostJobAuthUI(user);
      setPostJobLoginStatus("Account created. Pay KES 500 and submit your company job.");
    } catch (error) {
      const code = error?.code || "";
      const message =
        code === "auth/email-already-in-use"
          ? "Email already in use. Try signing in."
          : code === "auth/weak-password"
          ? "Password is too weak (min 6 characters)."
          : code === "auth/invalid-email"
          ? "Invalid email address."
          : "Account creation failed.";
      setPostJobLoginStatus(message, true);
    }
  });
}

if (postJobLogout) {
  postJobLogout.addEventListener("click", () => {
    signOutUser().finally(() => {
      updatePostJobAuthUI(null);
      setPostJobLoginStatus("Signed out.");
    });
  });
}

if (onAuthChange) {
  onAuthChange((user) => {
    updatePostJobAuthUI(user);
    loadSmartApplications();
  });
}

updatePostJobAuthUI(auth?.currentUser || null);
loadSmartApplications();
if (smartApplicationList) {
  window.setInterval(() => {
    loadSmartApplications();
  }, APPLICATION_REFRESH_MS);
}
