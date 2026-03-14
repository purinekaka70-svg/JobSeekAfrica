// js/jobs.js
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

// Populate counties dropdown
KENYA_COUNTIES.forEach(county => {
  const opt = document.createElement("option");
  opt.value = county;
  opt.textContent = county;
  countyFilter.appendChild(opt);
});

let allJobs = [];
let displayedJobs = [];
let jobsPerLoad = 50; // Load 50 jobs at a time
let loadIndex = 0;

// Fetch jobs from backend API (supports multiple pages)
async function fetchJobs() {
  jobsStatus.textContent = "Loading jobs...";
  allJobs = [];
  displayedJobs = [];
  loadIndex = 0;
  try {
    // Fetch multiple pages progressively to avoid freezing
    const totalPages = 50; // max pages
    const perPage = 50; // jobs per page
    for (let page = 1; page <= totalPages; page++) {
      const res = await fetch(`/api/fetchJobs?pages=${page}&perPage=${perPage}`);
      const data = await res.json();
      if (data.jobs?.length) {
        allJobs.push(...data.jobs);
      }
      // Optional: update status
      jobsStatus.textContent = `Loaded page ${page} / ${totalPages}...`;
    }
    // Deduplicate jobs
    allJobs = dedupeJobs(allJobs);
    jobsStatus.textContent = `Total ${allJobs.length} jobs loaded.`;
    renderNextBatch();
  } catch (err) {
    console.error(err);
    jobsStatus.textContent = "Failed to load jobs. Check API or console.";
  }
}

// Deduplicate jobs
function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    const key = job.applyUrl || `${job.title}-${job.company}-${job.county}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Render jobs batch-wise to avoid freezing
function renderNextBatch() {
  const nextBatch = allJobs.slice(loadIndex, loadIndex + jobsPerLoad);
  nextBatch.forEach(job => {
    const div = document.createElement("div");
    div.className = "job-card";
    if (job.type === "Internship") div.classList.add("highlight");
    div.innerHTML = `
      <h3>${job.title}</h3>
      <p><strong>Company:</strong> ${job.company}</p>
      <p><strong>Location:</strong> ${job.county || job.location}</p>
      <p><strong>Type:</strong> ${job.type}</p>
      <p>${job.description || ""}</p>
      <a href="${job.applyUrl}" target="_blank" class="btn">Apply</a>
    `;
    jobsList.appendChild(div);
    displayedJobs.push(job);
  });
  loadIndex += jobsPerLoad;

  if (loadIndex < allJobs.length) {
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

// Apply filters (keyword, category/type, county)
function applyFiltersFunc() {
  const keyword = searchInput.value.toLowerCase();
  const category = categoryFilter.value;
  const county = countyFilter.value;
  const filtered = allJobs.filter(job => {
    const matchKeyword = !keyword || job.title.toLowerCase().includes(keyword) || job.company.toLowerCase().includes(keyword) || job.description.toLowerCase().includes(keyword);
    const matchCategory = !category || job.type === category || job.category === category;
    const matchCounty = !county || job.county === county;
    return matchKeyword && matchCategory && matchCounty;
  });
  jobsList.innerHTML = "";
  displayedJobs = [];
  loadIndex = 0;
  allJobs = filtered;
  renderNextBatch();
  jobsStatus.textContent = `${filtered.length} jobs match your filters`;
}

// Clear filters
function clearFiltersFunc() {
  searchInput.value = "";
  categoryFilter.value = "";
  countyFilter.value = "";
  jobsList.innerHTML = "";
  displayedJobs = [];
  loadIndex = 0;
  fetchJobs();
}

// Event listeners
applyFilters.addEventListener("click", applyFiltersFunc);
clearFilters.addEventListener("click", clearFiltersFunc);
refreshJobs.addEventListener("click", fetchJobs);

// Initial fetch
fetchJobs();
