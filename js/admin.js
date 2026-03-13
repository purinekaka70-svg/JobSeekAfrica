import {
  db,
  firebaseReady,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "./firebase.js";

// Admin dashboard: simple login, view stats, and manage Firestore data.
const env = window.__ENV__ || {};
const ADMIN_EMAIL = env.ADMIN_EMAIL || "admin@jobseekafrica.com";
const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "admin123";

const loginSection = document.getElementById("adminLogin");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const dashboard = document.getElementById("adminDashboard");
const adminEmailInput = document.getElementById("adminEmail");
const adminPasswordInput = document.getElementById("adminPassword");

const cvCount = document.getElementById("cvCount");
const jobCount = document.getElementById("jobCount");
const qrCount = document.getElementById("qrCount");

const refreshDataBtn = document.getElementById("refreshData");
const logoutBtn = document.getElementById("logoutBtn");

const jobForm = document.getElementById("jobForm");
const jobTitle = document.getElementById("jobTitle");
const jobCompany = document.getElementById("jobCompany");
const jobLocation = document.getElementById("jobLocation");
const jobCounty = document.getElementById("jobCounty");
const jobCategory = document.getElementById("jobCategory");
const jobType = document.getElementById("jobType");
const jobLink = document.getElementById("jobLink");
const jobDeadline = document.getElementById("jobDeadline");
const jobDescription = document.getElementById("jobDescription");
const jobStatus = document.getElementById("jobStatus");
const jobSaveBtn = document.getElementById("jobSaveBtn");
const jobCancelBtn = document.getElementById("jobCancelBtn");

const pendingJobs = document.getElementById("pendingJobs");
const approvedJobs = document.getElementById("approvedJobs");
const cvList = document.getElementById("cvList");
const qrList = document.getElementById("qrList");

const SESSION_KEY = "jobseekafrica_admin_session";
const SESSION_TTL = 8 * 60 * 60 * 1000;

let editingJobId = null;
let editingJobApproved = false;

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

function setLoginStatus(message) {
  loginStatus.textContent = message;
}

function setJobStatus(message) {
  jobStatus.textContent = message;
}

function formatDate(value) {
  if (!value) {
    return "N/A";
  }
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }
  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function showDashboard(show) {
  dashboard.hidden = !show;
  loginSection.hidden = show;
}

function saveSession() {
  const payload = {
    email: ADMIN_EMAIL,
    expiresAt: Date.now() + SESSION_TTL
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function isSessionValid() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return false;
  }
  try {
    const payload = JSON.parse(raw);
    return payload.expiresAt && Date.now() < payload.expiresAt;
  } catch (error) {
    return false;
  }
}

function renderEmpty(container, message) {
  container.innerHTML = "";
  const empty = document.createElement("p");
  empty.className = "helper";
  empty.textContent = message;
  container.appendChild(empty);
}

function renderStats({ cvs, jobs, qrs }) {
  cvCount.textContent = cvs.length;
  jobCount.textContent = jobs.length;
  qrCount.textContent = qrs.length;
}

function resetJobForm() {
  editingJobId = null;
  editingJobApproved = false;
  jobForm.reset();
  jobSaveBtn.textContent = "Save Job";
  jobCancelBtn.hidden = true;
  setJobStatus("");
}

function normalizeDeadlineValue(value) {
  if (!value) {
    return "";
  }
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function populateJobForm(job) {
  jobTitle.value = job.title || "";
  jobCompany.value = job.company || "";
  jobLocation.value = job.location || "";
  if (jobCounty) {
    jobCounty.value = job.county || "";
  }
  jobCategory.value = job.category || "";
  jobType.value = job.type || "Internship";
  jobLink.value = job.applyUrl || "";
  jobDeadline.value = normalizeDeadlineValue(job.deadline);
  jobDescription.value = job.description || "";
}

function renderJobItem(job, container) {
  const item = document.createElement("div");
  item.className = "admin-item";

  const title = document.createElement("h4");
  title.textContent = job.title;

  const meta = document.createElement("p");
  meta.className = "helper";
  meta.textContent = `${job.company} | ${job.location} | ${job.county || "County"} | ${
    job.type || "Type"
  } | ${job.category || "Category"}`;

  const deadline = document.createElement("p");
  deadline.className = "helper";
  deadline.textContent = `Deadline: ${formatDate(job.deadline)}`;

  const actions = document.createElement("div");
  actions.className = "admin-actions";

  const approveBtn = document.createElement("button");
  approveBtn.className = "btn btn-ghost btn-sm";
  approveBtn.dataset.action = "toggle-approve";
  approveBtn.dataset.id = job.id;
  approveBtn.textContent = job.approved ? "Unapprove" : "Approve";

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-ghost btn-sm";
  editBtn.dataset.action = "edit-job";
  editBtn.dataset.id = job.id;
  editBtn.textContent = "Edit";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-ghost btn-sm";
  deleteBtn.dataset.action = "delete-job";
  deleteBtn.dataset.id = job.id;
  deleteBtn.textContent = "Delete";

  actions.append(approveBtn, editBtn, deleteBtn);
  item.append(title, meta, deadline, actions);
  container.appendChild(item);
}

function renderCvItem(cv, container) {
  const item = document.createElement("div");
  item.className = "admin-item";

  const title = document.createElement("h4");
  title.textContent = cv.fullName || "Unnamed CV";

  const meta = document.createElement("p");
  meta.className = "helper";
  meta.textContent = `${cv.email || "No email"} | ${cv.phone || "No phone"} | ${formatDate(
    cv.createdAt
  )}`;

  const actions = document.createElement("div");
  actions.className = "admin-actions";

  const approveBtn = document.createElement("button");
  approveBtn.className = "btn btn-ghost btn-sm";
  approveBtn.dataset.action = "toggle-cv-approval";
  approveBtn.dataset.id = cv.id;
  const isApproved = cv.downloadApproved !== false;
  approveBtn.textContent = isApproved ? "Revoke Download" : "Approve Download";

  actions.appendChild(approveBtn);
  item.append(title, meta, actions);
  container.appendChild(item);
}

function renderQrItem(qr, container) {
  const item = document.createElement("div");
  item.className = "admin-item";

  const title = document.createElement("h4");
  title.textContent = qr.type === "cv" ? "CV QR Code" : "QR Code";

  const meta = document.createElement("p");
  meta.className = "helper";
  meta.textContent = `${qr.text} | ${formatDate(qr.createdAt)}`;

  item.append(title, meta);
  container.appendChild(item);
}

async function loadData() {
  if (!firebaseReady || !db) {
    renderStats({ cvs: [], jobs: [], qrs: [] });
    renderEmpty(pendingJobs, "Firebase is not configured.");
    renderEmpty(approvedJobs, "Firebase is not configured.");
    renderEmpty(cvList, "Firebase is not configured.");
    renderEmpty(qrList, "Firebase is not configured.");
    return;
  }

  const [cvSnapshot, jobSnapshot, qrSnapshot] = await Promise.all([
    getDocs(collection(db, "cvs")),
    getDocs(collection(db, "jobs")),
    getDocs(collection(db, "qrcodes"))
  ]);

  const cvs = [];
  cvSnapshot.forEach((docSnap) => cvs.push({ id: docSnap.id, ...docSnap.data() }));

  const jobs = [];
  jobSnapshot.forEach((docSnap) => jobs.push({ id: docSnap.id, ...docSnap.data() }));

  const qrs = [];
  qrSnapshot.forEach((docSnap) => qrs.push({ id: docSnap.id, ...docSnap.data() }));

  renderStats({ cvs, jobs, qrs });

  pendingJobs.innerHTML = "";
  approvedJobs.innerHTML = "";
  cvList.innerHTML = "";
  qrList.innerHTML = "";

  const pending = jobs.filter((job) => !job.approved);
  const approved = jobs.filter((job) => job.approved);

  if (!pending.length) {
    renderEmpty(pendingJobs, "No pending jobs.");
  } else {
    pending.forEach((job) => renderJobItem(job, pendingJobs));
  }

  if (!approved.length) {
    renderEmpty(approvedJobs, "No approved jobs yet.");
  } else {
    approved.forEach((job) => renderJobItem(job, approvedJobs));
  }

  if (!cvs.length) {
    renderEmpty(cvList, "No CVs yet.");
  } else {
    cvs.forEach((cv) => renderCvItem(cv, cvList));
  }

  if (!qrs.length) {
    renderEmpty(qrList, "No QR codes yet.");
  } else {
    qrs.forEach((qr) => renderQrItem(qr, qrList));
  }
}

async function saveJob(event) {
  event.preventDefault();
  if (!firebaseReady || !db) {
    setJobStatus("Firebase is not configured.");
    return;
  }

  const payload = {
    title: jobTitle.value.trim(),
    company: jobCompany.value.trim(),
    location: jobLocation.value.trim(),
    county: jobCounty ? jobCounty.value : "",
    category: jobCategory.value.trim(),
    type: jobType.value,
    applyUrl: jobLink.value.trim(),
    deadline: jobDeadline.value ? new Date(jobDeadline.value).toISOString() : "",
    description: jobDescription.value.trim(),
    source: "Admin"
  };

  if (!payload.title || !payload.company || !payload.location || !payload.applyUrl) {
    setJobStatus("Fill in the required job fields.");
    return;
  }

  if (jobCounty && !payload.county) {
    setJobStatus("Select a county or Nationwide.");
    return;
  }

  try {
    if (editingJobId) {
      await updateDoc(doc(db, "jobs", editingJobId), {
        ...payload,
        approved: editingJobApproved,
        updatedAt: serverTimestamp()
      });
      setJobStatus("Job updated successfully.");
    } else {
      await addDoc(collection(db, "jobs"), {
        ...payload,
        approved: false,
        createdAt: serverTimestamp()
      });
      setJobStatus("Job added. Approve it to make it visible.");
    }
    resetJobForm();
    await loadData();
  } catch (error) {
    console.error(error);
    setJobStatus("Unable to save job right now.");
  }
}

function handleJobListClick(event) {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }
  const action = target.dataset.action;
  const jobId = target.dataset.id;
  if (!action || !jobId) {
    return;
  }

  if (action === "edit-job") {
    startEditJob(jobId);
    return;
  }

  if (action === "delete-job") {
    deleteJob(jobId);
    return;
  }

  if (action === "toggle-approve") {
    toggleJobApproval(jobId);
  }
}

async function startEditJob(jobId) {
  if (!firebaseReady || !db) {
    setJobStatus("Firebase is not configured.");
    return;
  }
  const snapshot = await getDocs(collection(db, "jobs"));
  let selected = null;
  snapshot.forEach((docSnap) => {
    if (docSnap.id === jobId) {
      selected = { id: docSnap.id, ...docSnap.data() };
    }
  });
  if (!selected) {
    setJobStatus("Job not found.");
    return;
  }

  editingJobId = selected.id;
  editingJobApproved = Boolean(selected.approved);
  populateJobForm(selected);
  jobSaveBtn.textContent = "Update Job";
  jobCancelBtn.hidden = false;
  setJobStatus("Editing job listing.");
}

async function deleteJob(jobId) {
  if (!firebaseReady || !db) {
    return;
  }
  if (!confirm("Delete this job listing?")) {
    return;
  }
  await deleteDoc(doc(db, "jobs", jobId));
  await loadData();
}

async function toggleJobApproval(jobId) {
  if (!firebaseReady || !db) {
    return;
  }

  const snapshot = await getDocs(collection(db, "jobs"));
  let selected = null;
  snapshot.forEach((docSnap) => {
    if (docSnap.id === jobId) {
      selected = { id: docSnap.id, ...docSnap.data() };
    }
  });

  if (!selected) {
    return;
  }

  await updateDoc(doc(db, "jobs", jobId), {
    approved: !selected.approved,
    updatedAt: serverTimestamp()
  });
  await loadData();
}

async function toggleCvApproval(cvId) {
  if (!firebaseReady || !db) {
    return;
  }

  const snapshot = await getDocs(collection(db, "cvs"));
  let selected = null;
  snapshot.forEach((docSnap) => {
    if (docSnap.id === cvId) {
      selected = { id: docSnap.id, ...docSnap.data() };
    }
  });

  if (!selected) {
    return;
  }

  const currentApproval = selected.downloadApproved !== false;
  await updateDoc(doc(db, "cvs", cvId), {
    downloadApproved: !currentApproval,
    updatedAt: serverTimestamp()
  });
  await loadData();
}

function handleCvListClick(event) {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }
  const action = target.dataset.action;
  const cvId = target.dataset.id;
  if (action === "toggle-cv-approval" && cvId) {
    toggleCvApproval(cvId);
  }
}

function populateCountySelect() {
  if (!jobCounty) {
    return;
  }
  jobCounty.innerHTML = "<option value=\"\">Select county</option>";
  const nationwide = document.createElement("option");
  nationwide.value = "Nationwide";
  nationwide.textContent = "Nationwide";
  jobCounty.appendChild(nationwide);

  KENYA_COUNTIES.forEach((county) => {
    const option = document.createElement("option");
    option.value = county;
    option.textContent = county;
    jobCounty.appendChild(option);
  });
}

function init() {
  populateCountySelect();
  if (isSessionValid()) {
    showDashboard(true);
    loadData();
  } else {
    showDashboard(false);
  }
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value.trim();

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    saveSession();
    showDashboard(true);
    setLoginStatus("");
    loadData();
  } else {
    setLoginStatus("Incorrect admin credentials.");
  }
});

jobForm.addEventListener("submit", saveJob);
jobCancelBtn.addEventListener("click", resetJobForm);
refreshDataBtn.addEventListener("click", loadData);
logoutBtn.addEventListener("click", () => {
  clearSession();
  resetJobForm();
  showDashboard(false);
});

pendingJobs.addEventListener("click", handleJobListClick);
approvedJobs.addEventListener("click", handleJobListClick);
cvList.addEventListener("click", handleCvListClick);

init();
