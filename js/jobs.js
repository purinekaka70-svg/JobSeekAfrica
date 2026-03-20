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
  signInUser,
  signUpUser,
  signOutUser,
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
const env = window.__ENV__ || {};

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
    setPostJobLoginStatus(`Signed in as ${user.email}. You can post jobs.`);
  } else {
    setPostJobLoginStatus("Sign in to submit a job listing.");
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
  if (t.includes("intern")) return "Internship";
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
    const isInternship = job.type === "Internship";
    if (isInternship) div.classList.add("highlight");
    const applyUrl = job.applyUrl || normalizeApplyUrl(job.url || job.redirect_url);
    const applyTarget = getApplyTarget();
    const applyButton = applyUrl
      ? `<a href="${applyUrl}" target="${applyTarget}" rel="noopener noreferrer" class="btn" aria-label="Apply for ${job.title}">Apply</a>`
      : `<span class="btn btn-ghost" aria-disabled="true">Apply</span>`;
    if (applyUrl) {
      div.dataset.applyUrl = applyUrl;
      div.tabIndex = 0;
      div.setAttribute("role", "link");
      div.setAttribute("aria-label", `Open application for ${job.title}`);
    }
  const tags = [];
  if (job.type) {
    tags.push(`<span class="tag ${isInternship ? "tag-highlight" : ""}">${job.type}</span>`);
  }
  const locationTag = getLocationTag(job);
  if (locationTag) {
    tags.push(`<span class="tag tag-county">${locationTag}</span>`);
  }
  if (job.source) {
    tags.push(`<span class="tag">${job.source}</span>`);
  }
    const tagsMarkup = tags.length ? `<div class="job-tags">${tags.join("")}</div>` : "";
    div.innerHTML = `
      ${tagsMarkup}
      <h3>${job.title}</h3>
      <p class="job-meta"><strong>Company:</strong> ${job.company}</p>
      <p class="job-meta"><strong>Location:</strong> ${getDisplayLocation(job)}</p>
      <p>${job.description || ""}</p>
      ${applyButton}
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

  // Posting a job is free (no payment required).
  const formData = new FormData(postJobForm);

  if (!firebaseReady || !db) {
    if (postJobMessage) postJobMessage.textContent = "Service unavailable (DB config missing).";
    return;
  }

  const btn = postJobForm.querySelector("button[type='submit']");
  if (btn) btn.disabled = true;
  if (postJobMessage) {
    postJobMessage.textContent = "Submitting job...";
    postJobMessage.style.color = "";
  }

  try {
    const authMeta = await getAuthMetadata();
    const jobData = {
      title: formData.get("title")?.trim(),
      company: formData.get("company")?.trim(),
      location: formData.get("location")?.trim(),
      county: formData.get("county")?.trim() || "",
      type: formData.get("type") || "Full-time",
      category: formData.get("category") || "General",
      description: formData.get("description")?.trim(),
      applyUrl: normalizeApplyUrl(formData.get("applyUrl")?.trim()),
      contactEmail: formData.get("email")?.trim(), // Contact email for internal use
      approved: false, // User posts require admin approval
      source: "Public Submission",
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
      postJobMessage.textContent = "Job submitted! It will appear after admin approval.";
      postJobMessage.style.color = "#027a48"; // Green success color
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

if (postJobForm) {
  postJobForm.addEventListener("submit", handlePostJob);
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
      setPostJobLoginStatus("Signed in. You can now submit a job.");
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
      setPostJobLoginStatus("Account created. You can now post a job.");
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
  });
}

updatePostJobAuthUI(auth?.currentUser || null);
