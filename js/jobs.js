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

// Populate counties
KENYA_COUNTIES.forEach(county => {
  const opt = document.createElement("option");
  opt.value = county;
  opt.textContent = county;
  countyFilter.appendChild(opt);
});

let allJobs = [];

async function fetchJobs() {
  jobsStatus.textContent = "Loading jobs...";
  try {
    const res = await fetch("/api/fetchJobs");
    const data = await res.json();
    allJobs = data.jobs || [];
    renderJobs(allJobs);
    jobsStatus.textContent = `${allJobs.length} jobs loaded.`;
  } catch (err) {
    console.error(err);
    jobsStatus.textContent = "Failed to load jobs. Check API or console.";
  }
}

function renderJobs(jobs) {
  jobsList.innerHTML = "";
  if (!jobs.length) {
    jobsList.innerHTML = "<p>No jobs found.</p>";
    return;
  }

  jobs.forEach(job => {
    const div = document.createElement("div");
    div.className = "job-card";
    div.innerHTML = `
      <h3>${job.title}</h3>
      <p><strong>Company:</strong> ${job.company}</p>
      <p><strong>Location:</strong> ${job.county || job.location}</p>
      <p><strong>Type:</strong> ${job.type}</p>
      <p>${job.description || ""}</p>
      <a href="${job.applyUrl}" target="_blank" class="btn">Apply</a>
    `;
    if (job.isInternship) div.classList.add("highlight");
    jobsList.appendChild(div);
  });
}

function applyFiltersFunc() {
  const keyword = searchInput.value.toLowerCase();
  const category = categoryFilter.value;
  const county = countyFilter.value;
  const filtered = allJobs.filter(job => {
    const matchKeyword = !keyword || job.title.toLowerCase().includes(keyword) || job.company.toLowerCase().includes(keyword);
    const matchCategory = !category || job.type === category;
    const matchCounty = !county || job.county === county;
    return matchKeyword && matchCategory && matchCounty;
  });
  renderJobs(filtered);
}

// Event listeners
applyFilters.addEventListener("click", applyFiltersFunc);
clearFilters.addEventListener("click", () => {
  searchInput.value = "";
  categoryFilter.value = "";
  countyFilter.value = "";
  renderJobs(allJobs);
});
refreshJobs.addEventListener("click", fetchJobs);

// Initial fetch
fetchJobs();
