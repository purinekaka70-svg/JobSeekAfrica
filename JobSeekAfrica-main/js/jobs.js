// js/jobs.js
import {
  db,
  firebaseReady,
  ensureAuth,
  verifyPaymentAccess,
  collection,
  addDoc,
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

const FALLBACK_JOBS = [
  {
    title: "Customer Service Representative",
    company: "Safaricom PLC",
    location: "Nairobi",
    county: "Nairobi",
    type: "Full-time",
    description: "Handle customer inquiries, resolve issues, and ensure customer satisfaction. Strong communication skills required.",
    applyUrl: "https://www.safaricom.co.ke/careers",
    createdAt: new Date()
  },
  {
    title: "Graduate Management Trainee",
    company: "KCB Bank",
    location: "Nationwide",
    county: "Nationwide",
    type: "Graduate Trainee",
    description: "Join our comprehensive training program designed to groom future leaders in the banking sector.",
    applyUrl: "https://kcbgroup.com/careers",
    createdAt: new Date()
  },
  {
    title: "Data Entry Clerk",
    company: "IEBC",
    location: "Mombasa",
    county: "Mombasa",
    type: "Contract",
    description: "Assist in data entry and verification processes. High typing speed and accuracy needed.",
    applyUrl: "#",
    createdAt: new Date()
  },
  {
    title: "Marketing Intern",
    company: "Marketing Agency KE",
    location: "Kisumu",
    county: "Kisumu",
    type: "Internship",
    description: "Assist with social media campaigns, content creation, and market research.",
    applyUrl: "#",
    createdAt: new Date()
  },
  {
    title: "Administrative Assistant",
    company: "NGO International",
    location: "Nairobi",
    county: "Nairobi",
    type: "Full-time",
    description: "Provide administrative support to the team, manage schedules, and handle office logistics.",
    applyUrl: "#",
    createdAt: new Date()
  },
  {
    title: "Sales Executive",
    company: "Insurance Co",
    location: "Nakuru",
    county: "Nakuru",
    type: "Commission",
    description: "Drive sales of insurance products, build client relationships, and meet monthly targets.",
    applyUrl: "#",
    createdAt: new Date()
  },
  {
    title: "IT Support Technician",
    company: "Tech Solutions Ltd",
    location: "Nairobi",
    county: "Nairobi",
    type: "Full-time",
    description: "Troubleshoot hardware and software issues, set up workstations, and provide technical support.",
    applyUrl: "#",
    createdAt: new Date()
  },
  {
    title: "Nurse",
    company: "Aga Khan Hospital",
    location: "Mombasa",
    county: "Mombasa",
    type: "Full-time",
    description: "Provide quality patient care, administer medications, and assist doctors in procedures.",
    applyUrl: "#",
    createdAt: new Date()
  },
  {
    title: "Driver",
    company: "Logistics Kenya",
    location: "Eldoret",
    county: "Uasin Gishu",
    type: "Contract",
    description: "Transport goods safely and timely to various destinations. Valid DL and clean record required.",
    applyUrl: "#",
    createdAt: new Date()
  },
  {
    title: "Accountant",
    company: "Financial Services Group",
    location: "Nairobi",
    county: "Nairobi",
    type: "Full-time",
    description: "Manage financial records, prepare tax returns, and ensure compliance with regulations.",
    applyUrl: "#",
    createdAt: new Date()
  }
];

// Populate counties dropdown
if (countyFilter) {
  KENYA_COUNTIES.forEach(county => {
    const opt = document.createElement("option");
    opt.value = county;
    opt.textContent = county;
    countyFilter.appendChild(opt);
  });
}

let allJobs = [];
let displayedJobs = [];
let activeJobs = [];
let jobsPerLoad = 50; // Load 50 jobs at a time
let loadIndex = 0;
const MPESA_VERIFY_ENDPOINT =
  window.__ENV__?.MPESA_VERIFY_ENDPOINT || "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/verifyMpesaRef";

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
  if (jobsList) {
    jobsList.innerHTML = "";
  }
  allJobs = [];
  activeJobs = [];
  displayedJobs = [];
  loadIndex = 0;
}

async function saveMpesaReference(reference) {
  if (!firebaseReady || !db) {
    return;
  }
  try {
    await ensureAuth();
    await addDoc(collection(db, "payments"), {
      refCode: reference,
      amount: 100,
      currency: "KES",
      source: "jobs_access",
      status: "pending",
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to save M-Pesa reference:", error);
  }
}

const DEFAULT_KEYWORDS = [
  "security",
  "guard",
  "officer",
  "assistant",
  "intern",
  "graduate trainee",
  "cashier",
  "driver",
  "customer service",
  "sales",
  "admin",
  "data",
  "cleaner",
  "hospitality",
  "technician"
];

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
function normalizeCounty(location) {
  if (!location) return "Nationwide";
  const lower = location.toLowerCase();
  for (const county of KENYA_COUNTIES) {
    if (lower.includes(county.toLowerCase())) return county;
  }
  return "Nationwide";
}

// Remove duplicates based on applyUrl
function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    if (!job.applyUrl || seen.has(job.applyUrl)) return false;
    seen.add(job.applyUrl);
    return true;
  });
}

function normalizeApplyUrl(url) {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function applyFallbackJobs(message) {
  if (!jobsList || !jobsStatus) {
    return;
  }
  jobsStatus.textContent = message;
  
  // Use fallbacks if no real jobs
  allJobs = FALLBACK_JOBS;
  activeJobs = allJobs;
  displayedJobs = [];
  loadIndex = 0;
  renderNextBatch();
}

// Fetch jobs via serverless proxy (avoids CORS + keeps API key private)
async function fetchFromCareerjetApi() {
  const endpointBase =
    window.__ENV__?.CAREERJET_PROXY_ENDPOINT || "/api/fetchJobs";
  const jobs = [];
  const totalPages = 5;
  const perPage = 50;

  const searchQuery = searchInput?.value?.trim();
  const keywordBatches = searchQuery ? [searchQuery] : DEFAULT_KEYWORDS;

  for (const keyword of keywordBatches) {
    for (let page = 1; page <= totalPages; page++) {
      try {
        const params = new URLSearchParams({
          q: keyword || "",
          page: page.toString(),
          pageSize: perPage.toString()
        });

        const locationFilter = countyFilter?.value;
        if (locationFilter && locationFilter !== "All Counties") {
          params.set("location", locationFilter);
        }

        const endpoint = `${endpointBase}?${params.toString()}`;
        const response = await fetch(endpoint);

        if (!response.ok) {
          break;
        }

        const data = await response.json();
        if (!data.jobs || !Array.isArray(data.jobs) || data.jobs.length === 0) {
          break;
        }
        jobs.push(...data.jobs);
      } catch (err) {
        break;
      }
    }
  }

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
    allJobs = await fetchFromFirestoreJobs();

    if (!allJobs.length) {
      console.log("No Firestore jobs found. Falling back to Careerjet API...");
      allJobs = await fetchFromCareerjetApi();
    }

    if (!allJobs.length) {
      applyFallbackJobs('Displaying latest opportunities.');
      return;
    }

    jobsStatus.textContent = `Total ${allJobs.length} jobs loaded.`;
    activeJobs = allJobs;
    renderNextBatch();

  } catch (err) {
    console.error("Error fetching jobs:", err);
    applyFallbackJobs("Displaying latest opportunities.");
  }
}

// Render jobs batch-wise to avoid freezing
function renderNextBatch() {
  if (!jobsList) {
    return;
  }
  const sourceJobs = activeJobs.length ? activeJobs : allJobs;
  const nextBatch = sourceJobs.slice(loadIndex, loadIndex + jobsPerLoad);
  nextBatch.forEach(job => {
    const div = document.createElement("div");
    div.className = "job-card";
    if (job.type === "Internship") div.classList.add("highlight");
    const applyUrl = normalizeApplyUrl(job.applyUrl || job.url);
    const applyButton = applyUrl
      ? `<a href="${applyUrl}" target="_blank" rel="noopener noreferrer" class="btn">Apply</a>`
      : `<span class="btn btn-ghost" aria-disabled="true">Apply</span>`;
    div.innerHTML = `
      <h3>${job.title}</h3>
      <p><strong>Company:</strong> ${job.company}</p>
      <p><strong>Location:</strong> ${job.county || job.location}</p>
      <p><strong>Type:</strong> ${job.type}</p>
      <p>${job.description || ""}</p>
      ${applyButton}
    `;
    jobsList.appendChild(div);
    displayedJobs.push(job);
  });
  loadIndex += jobsPerLoad;

  if (loadIndex < sourceJobs.length) {
    // Create a "Load More" button
    if (!document.getElementById("loadMoreBtn")) {
      const loadMoreBtn = document.createElement("button");
      loadMoreBtn.id = "loadMoreBtn";
      loadMoreBtn.className = "btn";
      loadMoreBtn.textContent = "Load More Jobs";
      loadMoreBtn.addEventListener("click", renderNextBatch);
      jobsList.parentNode.appendChild(loadMoreBtn);
    }
  } else {
    const loadMoreBtn = document.getElementById("loadMoreBtn");
    if (loadMoreBtn) loadMoreBtn.remove();
  }
}

// Apply filters (API filters for search/location, client-side for category)
function applyFiltersFunc() {
  if (!searchInput || !categoryFilter || !countyFilter || !jobsList || !jobsStatus) {
    return;
  }
  const keyword = searchInput.value.toLowerCase().trim();
  const category = categoryFilter.value;
  const county = countyFilter.value;

  // Filter jobs client-side for keyword, category, and county.
  const filtered = allJobs.filter(job => {
    const haystack = [
      job.title,
      job.company,
      job.description,
      job.location,
      job.county,
      job.type
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchKeyword = !keyword || haystack.includes(keyword);
    const matchCategory = !category || job.type === category;
    const matchCounty = !county || job.county === county || job.location === county;
    return matchKeyword && matchCategory && matchCounty;
  });

  // Update display
  jobsList.innerHTML = "";
  displayedJobs = [];
  loadIndex = 0;

  // Remove load more button if exists
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  if (loadMoreBtn) loadMoreBtn.remove();

  // Show filtered jobs
  activeJobs = filtered;
  renderNextBatch();
  jobsStatus.textContent = `${filtered.length} jobs match your filters`;
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

  // Remove load more button if exists
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  if (loadMoreBtn) loadMoreBtn.remove();

  activeJobs = allJobs;
  renderNextBatch();
  if (jobsStatus) {
    jobsStatus.textContent = `Total ${allJobs.length} jobs loaded.`;
  }
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

// Initial fetch
fetchJobs();

// --- Public Job Posting Feature ---
const postJobForm = document.getElementById("postJobForm");
const postJobMessage = document.getElementById("postJobMessage");

async function handlePostJob(e) {
  e.preventDefault();

  // 1. Capture and save M-Pesa reference first (if provided)
  const formData = new FormData(postJobForm);
  const mpesaRef = formData.get("mpesaRef")?.toString().trim();
  if (mpesaRef) {
    try {
      const user = await ensureAuth();
      if (user) {
        await addDoc(collection(db, "payments"), {
          refCode: mpesaRef,
          amount: 100,
          currency: "KES",
          source: "post_job",
          status: "pending",
          uid: user.uid,
          createdAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.warn("Could not save payment reference to Firestore.", e);
    }
  }

  // 2. Verify Payment Access
  const access = await verifyPaymentAccess();
  if (!access.ok) {
    if (postJobMessage) {
      postJobMessage.textContent = access.error || "Please pay the fee to post a job.";
      postJobMessage.style.color = "#b42318"; // Red error color
    }
    return;
  }

  if (!firebaseReady || !db) {
    if (postJobMessage) postJobMessage.textContent = "Service unavailable (DB config missing).";
    return;
  }

  const btn = postJobForm.querySelector("button[type='submit']");
  if (btn) btn.disabled = true;
  if (postJobMessage) postJobMessage.textContent = "Submitting job...";

  try {
    const jobData = {
      title: formData.get("title")?.trim(),
      company: formData.get("company")?.trim(),
      location: formData.get("location")?.trim(),
      type: formData.get("type") || "Full-time",
      category: formData.get("category") || "General",
      description: formData.get("description")?.trim(),
      applyUrl: formData.get("applyUrl")?.trim(),
      email: formData.get("email")?.trim(), // Contact email for internal use
      approved: false, // User posts require admin approval
      source: "Public Submission",
      createdAt: serverTimestamp()
    };

    if (!jobData.title || !jobData.company || !jobData.location) {
      throw new Error("Job Title, Company, and Location are required.");
    }

    await addDoc(collection(db, "jobs"), jobData);

    if (postJobMessage) {
      postJobMessage.textContent = "Job submitted! It will appear after admin approval.";
      postJobMessage.style.color = "#027a48"; // Green success color
    }
    postJobForm.reset();
  } catch (err) {
    console.error(err);
    if (postJobMessage) postJobMessage.textContent = "Error: " + err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

if (postJobForm) {
  postJobForm.addEventListener("submit", handlePostJob);
}
