import {
  auth,
  db,
  firebaseReady,
  onAuthChange,
  signInAdmin,
  signOutUser,
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
  query,
  where,
  serverTimestamp
} from "./firebase.js";

// Admin dashboard: simple login, view stats, and manage Firestore data.
const env = window.__ENV__ || {};
const ADMIN_EMAILS_RAW = env.ADMIN_EMAILS || env.ADMIN_EMAIL || "";
const ADMIN_EMAILS = ADMIN_EMAILS_RAW
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const REQUIRE_ADMIN_RECORD =
  String(env.ADMIN_REQUIRE_RECORD ?? "false").toLowerCase() === "true";
const DEFAULT_ADMIN_PLACEHOLDER = "admin@jobseekafrica.com";

function isPlaceholderAdminList(list) {
  return list.length === 1 && list[0] === DEFAULT_ADMIN_PLACEHOLDER;
}

function isAdminListConfigured() {
  return ADMIN_EMAILS.length > 0 && !isPlaceholderAdminList(ADMIN_EMAILS);
}

let adminRecordOk = false;

function isAllowedAdmin(user) {
  if (!user || !user.email) return false;
  if (
    isAdminListConfigured() &&
    !ADMIN_EMAILS.includes(String(user.email || "").toLowerCase())
  ) {
    return false;
  }
  if (!REQUIRE_ADMIN_RECORD) {
    return true;
  }
  return adminRecordOk;
}

async function checkAdminRecord(user) {
  adminRecordOk = false;
  if (!user || !db) {
    return false;
  }
  try {
    const snapshot = await getDoc(doc(db, "admins", user.uid));
    if (!snapshot.exists()) {
      return false;
    }
    const data = snapshot.data() || {};
    if (data.enabled === false) {
      return false;
    }
    adminRecordOk = true;
    return true;
  } catch (error) {
    console.warn("Admin record check failed:", error);
    return false;
  }
}

const loginSection = document.getElementById("adminLogin");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const dashboard = document.getElementById("adminDashboard");
const adminMenuToggle = document.getElementById("adminMenuToggle");
const adminSidebar = document.getElementById("adminSidebar");
const adminOverlay = document.getElementById("adminOverlay");
const adminEmailInput = document.getElementById("adminEmail");
const adminPasswordInput = document.getElementById("adminPassword");
const loginBtn = loginForm ? loginForm.querySelector("button[type=\"submit\"]") : null;

const cvCount = document.getElementById("cvCount");
const jobCount = document.getElementById("jobCount");
const qrCount = document.getElementById("qrCount");
const letterCount = document.getElementById("letterCount");
const portfolioCount = document.getElementById("portfolioCount");
const paymentList = document.getElementById("paymentList");

const refreshDataBtn = document.getElementById("refreshData");
const syncJobsBtn = document.getElementById("syncJobs");
const logoutBtn = document.getElementById("logoutBtn");
const purgeAnonBtn = document.getElementById("purgeAnon");
const clearUserDataBtn = document.getElementById("clearUserData");
const clearJobsBtn = document.getElementById("clearJobs");
const clearJobsAnonBtn = document.getElementById("clearJobsAnon");
const maintenanceStatus = document.getElementById("maintenanceStatus");
const syncStatus = document.getElementById("syncStatus");
const adminServerIp = document.getElementById("adminServerIp");

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
const letterList = document.getElementById("letterList");
const portfolioList = document.getElementById("portfolioList");
const adminNavLinks = Array.from(document.querySelectorAll(".admin-side-nav a"));
const adminSections = Array.from(document.querySelectorAll(".admin-section"));
const DEFAULT_ADMIN_SECTION = "adminOverview";
const SYNC_JOBS_ENDPOINT =
  env.SYNC_JOBS_ENDPOINT || "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/syncCareerjetJobsNow";
const SYNC_JOBS_TOKEN = env.MANUAL_SYNC_TOKEN || "";
const CLEAR_JOBS_ENDPOINT = env.CLEAR_JOBS_ENDPOINT || "/api/clearJobs";
const SYNC_IP_URL = String(env.SYNC_REDIRECT_URL || "/api/ip").trim();
const SYNC_IP_TARGET =
  String(env.SYNC_REDIRECT_TARGET || "_blank").toLowerCase() === "_self" ? "_self" : "_blank";
const SYNC_SUCCESS_URL = String(env.SYNC_SUCCESS_URL || "jobs.html").trim();
const SYNC_SUCCESS_TARGET =
  String(env.SYNC_SUCCESS_TARGET || "_self").toLowerCase() === "_blank" ? "_blank" : "_self";

const editPanel = document.getElementById("editPanel");
const editPanelMeta = document.getElementById("editPanelMeta");
const editPanelTextarea = document.getElementById("editPanelTextarea");
const editPanelSave = document.getElementById("editPanelSave");
const editPanelCancel = document.getElementById("editPanelCancel");
const editPanelStatus = document.getElementById("editPanelStatus");

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

function setMaintenanceStatus(message) {
  if (maintenanceStatus) {
    maintenanceStatus.textContent = message;
  } else {
    setJobStatus(message);
  }
}

function setSyncStatus(message) {
  if (syncStatus) {
    syncStatus.textContent = message;
  }
}

function setEditStatus(message) {
  if (editPanelStatus) {
    editPanelStatus.textContent = message;
  } else {
    setMaintenanceStatus(message);
  }
}

function formatAdminError(error, fallbackMessage) {
  const code = error?.code || "";
  const email = auth?.currentUser?.email || "unknown email";
  const projectId = env.FIREBASE_PROJECT_ID || "unknown project";
  if (code === "permission-denied") {
    return `Permission denied for ${email} on ${projectId}. Check Firestore rules.`;
  }
  if (code === "unauthenticated") {
    return "You are signed out. Please log in again.";
  }
  return fallbackMessage;
}

function serializeForEdit(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeForEdit);
  }
  if (value && typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      result[key] = serializeForEdit(val);
    });
    return result;
  }
  return value;
}

let currentEdit = null;

function openEditPanel(collectionName, docId, data) {
  if (!editPanel || !editPanelTextarea) {
    return;
  }
  const serial = serializeForEdit(data || {});
  editPanelTextarea.value = JSON.stringify(serial, null, 2);
  if (editPanelMeta) {
    editPanelMeta.textContent = `${collectionName} / ${docId}`;
  }
  setEditStatus("");
  currentEdit = { collectionName, docId };
  editPanel.hidden = false;
  editPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEditPanel() {
  currentEdit = null;
  if (editPanel) {
    editPanel.hidden = true;
  }
  if (editPanelTextarea) {
    editPanelTextarea.value = "";
  }
  setEditStatus("");
}

async function saveEditPanel() {
  if (!currentEdit || !firebaseReady || !db) {
    return;
  }
  if (!requireAdmin("Editing data")) {
    return;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(editPanelTextarea.value || "{}");
  } catch (error) {
    setEditStatus("Invalid JSON. Fix the JSON and try again.");
    return;
  }
  if (!parsed || typeof parsed !== "object") {
    setEditStatus("Edited data must be an object.");
    return;
  }
  delete parsed.createdAt;
  delete parsed.updatedAt;

  try {
    await updateDoc(doc(db, currentEdit.collectionName, currentEdit.docId), {
      ...parsed,
      updatedAt: serverTimestamp()
    });
    setEditStatus("Saved changes.");
    await loadData();
  } catch (error) {
    console.error(error);
    setEditStatus("Failed to save changes.");
  }
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

function isValidAdminSection(sectionId) {
  return adminSections.some((section) => section.id === sectionId);
}

function getAdminSectionFromHash() {
  const hash = String(window.location.hash || "").replace("#", "").trim();
  if (hash === "adminDashboard") {
    return DEFAULT_ADMIN_SECTION;
  }
  if (hash && isValidAdminSection(hash)) {
    return hash;
  }
  return DEFAULT_ADMIN_SECTION;
}

function setActiveAdminSection(sectionId) {
  if (!adminSections.length) {
    return;
  }
  const resolved = isValidAdminSection(sectionId)
    ? sectionId
    : DEFAULT_ADMIN_SECTION;
  const showAll = resolved === DEFAULT_ADMIN_SECTION;
  adminSections.forEach((section) => {
    section.hidden = !showAll && section.id !== resolved;
  });
  adminNavLinks.forEach((link) => {
    const target = link.getAttribute("href") || "";
    link.classList.toggle("active", target === `#${resolved}`);
  });
}

function syncAdminSectionFromHash() {
  setActiveAdminSection(getAdminSectionFromHash());
}

function requireAdmin(actionLabel) {
  const user = auth?.currentUser || null;
  if (!user) {
    setJobStatus(`${actionLabel} requires admin login.`);
    return null;
  }
  if (!isAllowedAdmin(user)) {
    let message = "Not authorized for admin access.";
    if (!adminRecordOk) {
      message = "Admin record missing. Add admins/{uid} in Firestore.";
    }
    setJobStatus(message);
    signOutUser();
    return null;
  }
  return user;
}

function renderEmpty(container, message) {
  container.innerHTML = "";
  const empty = document.createElement("p");
  empty.className = "helper";
  empty.textContent = message;
  container.appendChild(empty);
}

function renderStats({ cvs, jobs, qrs, letters, portfolios }) {
  if (cvCount) cvCount.textContent = cvs.length;
  if (jobCount) jobCount.textContent = jobs.length;
  if (qrCount) qrCount.textContent = qrs.length;
  if (letterCount) letterCount.textContent = letters.length;
  if (portfolioCount) portfolioCount.textContent = portfolios.length;
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

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-ghost btn-sm";
  editBtn.dataset.action = "edit-cv";
  editBtn.dataset.id = cv.id;
  editBtn.textContent = "Edit";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-ghost btn-sm";
  deleteBtn.dataset.action = "delete-cv";
  deleteBtn.dataset.id = cv.id;
  deleteBtn.textContent = "Delete";

  actions.append(approveBtn, editBtn, deleteBtn);
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

  const actions = document.createElement("div");
  actions.className = "admin-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-ghost btn-sm";
  editBtn.dataset.action = "edit-qr";
  editBtn.dataset.id = qr.id;
  editBtn.textContent = "Edit";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-ghost btn-sm";
  deleteBtn.dataset.action = "delete-qr";
  deleteBtn.dataset.id = qr.id;
  deleteBtn.textContent = "Delete";

  actions.append(editBtn, deleteBtn);

  item.append(title, meta, actions);
  container.appendChild(item);
}

function renderPaymentItem(payment, container) {
  const item = document.createElement("div");
  item.className = "admin-item";

  const title = document.createElement("h4");
  title.textContent = payment.refCode || "Unknown Reference";

  const meta = document.createElement("p");
  meta.className = "helper";
  meta.textContent = `${payment.phone || "No phone"} | ${payment.amount || 0} ${
    payment.currency || "KES"
  } | ${payment.status || "pending"} | ${formatDate(payment.createdAt)}`;

  const actions = document.createElement("div");
  actions.className = "admin-actions";

  const verifyBtn = document.createElement("button");
  verifyBtn.className = "btn btn-ghost btn-sm";
  verifyBtn.dataset.action = "verify-payment";
  verifyBtn.dataset.id = payment.id;
  verifyBtn.textContent = payment.status === "verified" ? "Verified" : "Verify";
  verifyBtn.disabled = payment.status === "verified";

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-ghost btn-sm";
  editBtn.dataset.action = "edit-payment";
  editBtn.dataset.id = payment.id;
  editBtn.textContent = "Edit";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-ghost btn-sm";
  deleteBtn.dataset.action = "delete-payment";
  deleteBtn.dataset.id = payment.id;
  deleteBtn.textContent = "Delete";

  actions.append(verifyBtn, editBtn, deleteBtn);
  item.append(title, meta, actions);
  container.appendChild(item);
}

function renderLetterItem(letter, container) {
  const item = document.createElement("div");
  item.className = "admin-item";

  const title = document.createElement("h4");
  title.textContent = letter.fullName || "Cover Letter";

  const meta = document.createElement("p");
  meta.className = "helper";
  meta.textContent = `${letter.jobTitle || "Job"} | ${letter.company || "Company"} | ${formatDate(
    letter.createdAt
  )}`;

  const actions = document.createElement("div");
  actions.className = "admin-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-ghost btn-sm";
  editBtn.dataset.action = "edit-letter";
  editBtn.dataset.id = letter.id;
  editBtn.textContent = "Edit";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-ghost btn-sm";
  deleteBtn.dataset.action = "delete-letter";
  deleteBtn.dataset.id = letter.id;
  deleteBtn.textContent = "Delete";

  actions.append(editBtn, deleteBtn);
  item.append(title, meta, actions);
  container.appendChild(item);
}

function renderPortfolioItem(portfolio, container) {
  const item = document.createElement("div");
  item.className = "admin-item";

  const title = document.createElement("h4");
  title.textContent = portfolio.fullName || "Portfolio";

  const meta = document.createElement("p");
  meta.className = "helper";
  meta.textContent = `${portfolio.title || "Title"} | ${portfolio.email || "No email"} | ${formatDate(
    portfolio.createdAt
  )}`;

  const actions = document.createElement("div");
  actions.className = "admin-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-ghost btn-sm";
  editBtn.dataset.action = "edit-portfolio";
  editBtn.dataset.id = portfolio.id;
  editBtn.textContent = "Edit";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-ghost btn-sm";
  deleteBtn.dataset.action = "delete-portfolio";
  deleteBtn.dataset.id = portfolio.id;
  deleteBtn.textContent = "Delete";

  actions.append(editBtn, deleteBtn);
  item.append(title, meta, actions);
  container.appendChild(item);
}

const USER_DATA_COLLECTIONS = ["cvs", "letters", "portfolios", "qrcodes", "payments"];

async function collectAnonymousDocs(collectionName) {
  const docMap = new Map();
  const queries = [
    where("uid", "==", "anonymous"),
    where("isAnonymous", "==", true),
    where("authProvider", "==", "anonymous")
  ];

  for (const constraint of queries) {
    const snap = await getDocs(query(collection(db, collectionName), constraint));
    snap.forEach((docSnap) => docMap.set(docSnap.id, docSnap));
  }

  return Array.from(docMap.values());
}

async function deleteDocBatch(collectionName, docSnaps) {
  let deleted = 0;
  for (const docSnap of docSnaps) {
    await deleteDoc(doc(db, collectionName, docSnap.id));
    deleted += 1;
  }
  return deleted;
}

async function purgeAnonymousData(options) {
  if (options?.preventDefault) {
    options.preventDefault();
  }
  const silent = Boolean(options && options.silent);
  if (!firebaseReady || !db) {
    setMaintenanceStatus("Firebase is not configured.");
    return { ok: false, deleted: 0, error: "firebase_not_configured" };
  }
  if (!requireAdmin("Deleting anonymous data")) {
    return { ok: false, deleted: 0, error: "not_authorized" };
  }
  const skipConfirm = Boolean(options && options.skipConfirm);
  if (!skipConfirm) {
    const confirmed = confirm(
      "Delete all anonymous user data (CVs, letters, portfolios, QR codes, payments)? This cannot be undone."
    );
    if (!confirmed) {
      return { ok: false, deleted: 0, error: "cancelled" };
    }
  }

  if (!silent) {
    setMaintenanceStatus("Deleting anonymous user data...");
  }
  let totalDeleted = 0;

  try {
    for (const collectionName of USER_DATA_COLLECTIONS) {
      const docs = await collectAnonymousDocs(collectionName);
      if (docs.length) {
        const deleted = await deleteDocBatch(collectionName, docs);
        totalDeleted += deleted;
      }
    }

    if (!silent) {
      setMaintenanceStatus(`Deleted ${totalDeleted} anonymous records.`);
      await loadData();
    }
    return { ok: true, deleted: totalDeleted };
  } catch (error) {
    console.error(error);
    if (!silent) {
      setMaintenanceStatus(
        formatAdminError(error, "Unable to delete anonymous data. Check admin permissions.")
      );
    }
    return { ok: false, deleted: totalDeleted, error };
  }
}

async function clearAllUserData(options) {
  if (options?.preventDefault) {
    options.preventDefault();
  }
  const silent = Boolean(options && options.silent);
  if (!firebaseReady || !db) {
    setMaintenanceStatus("Firebase is not configured.");
    return { ok: false, deleted: 0, error: "firebase_not_configured" };
  }
  if (!requireAdmin("Deleting user data")) {
    return { ok: false, deleted: 0, error: "not_authorized" };
  }
  const skipConfirm = Boolean(options && options.skipConfirm);
  if (!skipConfirm) {
    const confirmed = confirm(
      "Delete ALL user data (CVs, letters, portfolios, QR codes, payments)? This cannot be undone."
    );
    if (!confirmed) {
      return { ok: false, deleted: 0, error: "cancelled" };
    }
  }

  if (!silent) {
    setMaintenanceStatus("Deleting all user data...");
  }
  let totalDeleted = 0;

  try {
    for (const collectionName of USER_DATA_COLLECTIONS) {
      const snap = await getDocs(collection(db, collectionName));
      const docs = [];
      snap.forEach((docSnap) => docs.push(docSnap));
      if (docs.length) {
        const deleted = await deleteDocBatch(collectionName, docs);
        totalDeleted += deleted;
      }
    }

    if (!silent) {
      setMaintenanceStatus(`Deleted ${totalDeleted} total records.`);
      await loadData();
    }
    return { ok: true, deleted: totalDeleted };
  } catch (error) {
    console.error(error);
    if (!silent) {
      setMaintenanceStatus(
        formatAdminError(error, "Unable to delete user data. Check admin permissions.")
      );
    }
    return { ok: false, deleted: totalDeleted, error };
  }
}

async function clearAllJobs(options) {
  if (options?.preventDefault) {
    options.preventDefault();
  }
  const silent = Boolean(options && options.silent);
  if (!firebaseReady || !db) {
    setMaintenanceStatus("Firebase is not configured.");
    return { ok: false, deleted: 0, error: "firebase_not_configured" };
  }
  if (!requireAdmin("Deleting jobs")) {
    return { ok: false, deleted: 0, error: "not_authorized" };
  }
  const skipConfirm = Boolean(options && options.skipConfirm);
  if (!skipConfirm) {
    const confirmed = confirm(
      "Delete ALL jobs in Firestore? This cannot be undone."
    );
    if (!confirmed) {
      return { ok: false, deleted: 0, error: "cancelled" };
    }
  }

  if (!silent) {
    setMaintenanceStatus("Deleting all jobs...");
  }
  const endpoint = String(CLEAR_JOBS_ENDPOINT || "").trim();
  if (endpoint) {
    try {
      const url = new URL(endpoint, window.location.href);
      if (SYNC_JOBS_TOKEN) {
        url.searchParams.set("token", SYNC_JOBS_TOKEN);
      }
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(SYNC_JOBS_TOKEN ? { "x-sync-token": SYNC_JOBS_TOKEN } : {})
        },
        body: JSON.stringify({ source: "admin" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Delete failed.");
      }
      const deletedCount = Number.isFinite(Number(data.deleted))
        ? Number(data.deleted)
        : 0;
      if (!silent) {
        setMaintenanceStatus(`Deleted ${deletedCount} jobs.`);
        await loadData();
      }
      return { ok: true, deleted: deletedCount };
    } catch (error) {
      console.error(error);
      if (!silent) {
        setMaintenanceStatus("Delete failed, falling back to manual delete...");
      }
    }
  }

  try {
    const snap = await getDocs(collection(db, "jobs"));
    const docs = [];
    snap.forEach((docSnap) => docs.push(docSnap));
    if (!docs.length) {
      if (!silent) {
        setMaintenanceStatus("No jobs found to delete.");
      }
      return { ok: true, deleted: 0 };
    }
    const deleted = await deleteDocBatch("jobs", docs);
    if (!silent) {
      setMaintenanceStatus(`Deleted ${deleted} jobs.`);
      await loadData();
    }
    return { ok: true, deleted };
  } catch (error) {
    console.error(error);
    if (!silent) {
      setMaintenanceStatus(
        formatAdminError(error, "Unable to delete jobs. Check admin permissions.")
      );
    }
    return { ok: false, deleted: 0, error };
  }
}

async function clearJobsAndAnonymous(options) {
  if (options?.preventDefault) {
    options.preventDefault();
  }
  if (!firebaseReady || !db) {
    setMaintenanceStatus("Firebase is not configured.");
    return;
  }
  if (!requireAdmin("Deleting jobs and anonymous data")) {
    return;
  }
  const confirmed = confirm(
    "Delete ALL jobs and ALL anonymous data? This cannot be undone."
  );
  if (!confirmed) {
    return;
  }
  setMaintenanceStatus("Deleting jobs and anonymous data...");
  const jobsResult = await clearAllJobs({ skipConfirm: true, silent: true });
  const anonResult = await purgeAnonymousData({ skipConfirm: true, silent: true });

  if (!jobsResult.ok || !anonResult.ok) {
    const pieces = [];
    if (!jobsResult.ok) pieces.push("Jobs delete failed");
    if (!anonResult.ok) pieces.push("Anonymous delete failed");
    setMaintenanceStatus(pieces.join(". "));
    return;
  }

  setMaintenanceStatus(
    `Deleted ${jobsResult.deleted} jobs and ${anonResult.deleted} anonymous records.`
  );
  await loadData();
}

async function fetchSnapshotSafely(label, fetcher, container) {
  try {
    return await fetcher();
  } catch (error) {
    console.error(`${label} fetch error:`, error);
    if (container) {
      renderEmpty(container, `Unable to load ${label}. Check admin permissions.`);
    }
    return null;
  }
}

async function loadData() {
  if (!firebaseReady || !db) {
    renderStats({ cvs: [], jobs: [], qrs: [], letters: [], portfolios: [] });
    renderEmpty(pendingJobs, "Firebase is not configured.");
    renderEmpty(approvedJobs, "Firebase is not configured.");
    renderEmpty(cvList, "Firebase is not configured.");
    renderEmpty(qrList, "Firebase is not configured.");
    if (letterList) renderEmpty(letterList, "Firebase is not configured.");
    if (portfolioList) renderEmpty(portfolioList, "Firebase is not configured.");
    if (paymentList) renderEmpty(paymentList, "Firebase is not configured.");
    return;
  }

  const cvSnapshot = await fetchSnapshotSafely(
    "CVs",
    () => getDocs(collection(db, "cvs")),
    cvList
  );
  const jobSnapshot = await fetchSnapshotSafely(
    "Jobs",
    () => getDocs(collection(db, "jobs")),
    approvedJobs
  );
  const qrSnapshot = await fetchSnapshotSafely(
    "QR codes",
    () => getDocs(collection(db, "qrcodes")),
    qrList
  );
  const letterSnapshot = await fetchSnapshotSafely(
    "Cover letters",
    () => getDocs(collection(db, "letters")),
    letterList
  );
  const portfolioSnapshot = await fetchSnapshotSafely(
    "Portfolios",
    () => getDocs(collection(db, "portfolios")),
    portfolioList
  );
  const paymentSnapshot = await fetchSnapshotSafely(
    "Payments",
    () => getDocs(query(collection(db, "payments"), orderBy("createdAt", "desc"))),
    paymentList
  );

  const cvs = [];
  if (cvSnapshot) {
    cvSnapshot.forEach((docSnap) => cvs.push({ id: docSnap.id, ...docSnap.data() }));
  }

  const jobs = [];
  if (jobSnapshot) {
    jobSnapshot.forEach((docSnap) => jobs.push({ id: docSnap.id, ...docSnap.data() }));
  }

  const qrs = [];
  if (qrSnapshot) {
    qrSnapshot.forEach((docSnap) => qrs.push({ id: docSnap.id, ...docSnap.data() }));
  }

  const letters = [];
  if (letterSnapshot) {
    letterSnapshot.forEach((docSnap) =>
      letters.push({ id: docSnap.id, ...docSnap.data() })
    );
  }

  const portfolios = [];
  if (portfolioSnapshot) {
    portfolioSnapshot.forEach((docSnap) =>
      portfolios.push({ id: docSnap.id, ...docSnap.data() })
    );
  }

  const payments = [];
  if (paymentSnapshot) {
    paymentSnapshot.forEach((docSnap) =>
      payments.push({ id: docSnap.id, ...docSnap.data() })
    );
  }

  renderStats({ cvs, jobs, qrs, letters, portfolios });

  if (jobSnapshot) {
    pendingJobs.innerHTML = "";
    approvedJobs.innerHTML = "";
  }
  if (cvSnapshot) {
    cvList.innerHTML = "";
  }
  if (qrSnapshot) {
    qrList.innerHTML = "";
  }
  if (letterList && letterSnapshot) letterList.innerHTML = "";
  if (portfolioList && portfolioSnapshot) portfolioList.innerHTML = "";

  const pending = jobs.filter((job) => !job.approved);
  const approved = jobs.filter((job) => job.approved);

  if (jobSnapshot) {
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
  }

  if (cvSnapshot) {
    if (!cvs.length) {
      renderEmpty(cvList, "No CVs yet.");
    } else {
      cvs.forEach((cv) => renderCvItem(cv, cvList));
    }
  }

  if (letterList && letterSnapshot) {
    if (!letters.length) {
      renderEmpty(letterList, "No letters yet.");
    } else {
      letters.forEach((letter) => renderLetterItem(letter, letterList));
    }
  }

  if (portfolioList && portfolioSnapshot) {
    if (!portfolios.length) {
      renderEmpty(portfolioList, "No portfolios yet.");
    } else {
      portfolios.forEach((portfolio) => renderPortfolioItem(portfolio, portfolioList));
    }
  }

  if (qrSnapshot) {
    if (!qrs.length) {
      renderEmpty(qrList, "No QR codes yet.");
    } else {
      qrs.forEach((qr) => renderQrItem(qr, qrList));
    }
  }

  if (paymentList && paymentSnapshot) {
    paymentList.innerHTML = "";
    if (!payments.length) {
      renderEmpty(paymentList, "No payments yet.");
    } else {
      payments.forEach((payment) => renderPaymentItem(payment, paymentList));
    }
  }
}

async function seedLocalJobs() {
  if (!firebaseReady || !db) {
    setJobStatus("Firebase is not configured.");
    return;
  }
  if (!requireAdmin("Job sync")) {
    return;
  }
  setJobStatus("Generating sample jobs...");
  
  const sampleJobs = [
    { title: "Software Developer", company: "Tech Solutions Ltd", location: "Nairobi", type: "Full-time" },
    { title: "Digital Marketer", company: "Growth Agency", location: "Mombasa", type: "Contract" },
    { title: "Accountant", company: "FinServe Kenya", location: "Nakuru", type: "Full-time" },
    { title: "Customer Support", company: "Connect BPO", location: "Nairobi", type: "Full-time" },
    { title: "Medical Officer", company: "City Hospital", location: "Kisumu", type: "Full-time" },
    { title: "Sales Executive", company: "Global Traders", location: "Eldoret", type: "Commission" },
    { title: "Project Manager", company: "BuildIt Construction", location: "Thika", type: "Contract" },
    { title: "Receptionist", company: "Law Associates", location: "Nairobi", type: "Full-time" },
    { title: "Graphics Designer", company: "Creative Hub", location: "Remote", type: "Part-time" },
    { title: "Data Entry Clerk", company: "Logistics Co", location: "Mombasa", type: "Contract" }
  ];

  try {
    const batchPromises = sampleJobs.map(job => 
      addDoc(collection(db, "jobs"), {
        ...job,
        county: job.location === "Remote" ? "Nationwide" : job.location,
        applyUrl: "#",
        description: `This is a sample description for the ${job.title} role at ${job.company}.`,
        category: "General",
        approved: true,
        source: "Admin Sync (Simulated)",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    );
    await Promise.all(batchPromises);
    setJobStatus(`Success: Added ${sampleJobs.length} jobs to database.`);
    await loadData();
  } catch (error) {
    console.error(error);
    setJobStatus("Note: " + error.message + " (Check permissions)");
  }
}

async function triggerJobSync() {
  if (!requireAdmin("Job sync")) {
    return;
  }
  openSyncIpTab();
  if (!SYNC_JOBS_ENDPOINT || SYNC_JOBS_ENDPOINT.includes("YOUR_REGION")) {
    await seedLocalJobs();
    openSyncSuccessPage();
    return;
  }
  setJobStatus("Starting job sync...");
  setSyncStatus("Starting job sync...");
  try {
    const url = new URL(SYNC_JOBS_ENDPOINT);
    if (SYNC_JOBS_TOKEN) {
      url.searchParams.set("token", SYNC_JOBS_TOKEN);
    }
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SYNC_JOBS_TOKEN ? { "x-sync-token": SYNC_JOBS_TOKEN } : {})
      },
      body: JSON.stringify({ source: "admin" })
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data.error || "Sync failed.";
      setJobStatus(message);
      setSyncStatus(message);
      return;
    }
    const parts = [];
    if (Number.isFinite(Number(data.count))) {
      parts.push(`Synced ${Number(data.count)} jobs`);
    }
    if (Number.isFinite(Number(data.pruned))) {
      parts.push(`Removed ${Number(data.pruned)} old jobs`);
    }
    if (data?.ip) {
      const ipLabel = data?.ipSource === "egress" ? "Server IP" : "Request IP";
      parts.push(`${ipLabel}: ${data.ip}`);
    }
    const summary = parts.length ? ` ${parts.join(". ")}.` : "";
    const message = `${data.message || "Sync complete."}${summary}`;
    setJobStatus(message);
    setSyncStatus(message);
    await loadData();
    openSyncSuccessPage();
  } catch (error) {
    console.error(error);
    setJobStatus("Sync failed. Check network or token.");
    setSyncStatus("Sync failed. Check network or token.");
  }
}

function openSyncIpTab() {
  if (!SYNC_IP_URL || SYNC_IP_TARGET !== "_blank") {
    return;
  }
  openSyncTarget(SYNC_IP_URL, "_blank");
}

function openSyncSuccessPage() {
  if (!SYNC_SUCCESS_URL) {
    return;
  }
  openSyncTarget(SYNC_SUCCESS_URL, SYNC_SUCCESS_TARGET);
}

function openSyncTarget(targetUrl, targetMode) {
  if (!targetUrl) {
    return;
  }
  let finalUrl = null;
  try {
    finalUrl = new URL(targetUrl, window.location.href).toString();
  } catch (error) {
    console.warn("Invalid sync redirect URL:", targetUrl);
    return;
  }

  if (targetMode === "_self") {
    window.location.assign(finalUrl);
    return;
  }

  window.open(finalUrl, "_blank", "noopener");
}

async function loadServerIp() {
  if (!adminServerIp) {
    return;
  }
  adminServerIp.textContent = "Loading...";
  try {
    const response = await fetch("/api/ip", { cache: "no-store" });
    if (!response.ok) {
      adminServerIp.textContent = "Unavailable";
      return;
    }
    const data = await response.json();
    adminServerIp.textContent = data?.ip || "Unavailable";
  } catch (error) {
    adminServerIp.textContent = "Unavailable";
  }
}

async function saveJob(event) {
  event.preventDefault();
  if (!firebaseReady || !db) {
    setJobStatus("Firebase is not configured.");
    return;
  }
  if (!requireAdmin("Saving jobs")) {
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
        approved: true,
        createdAt: serverTimestamp()
      });
      setJobStatus("Job added and approved successfully.");
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
  if (!requireAdmin("Editing jobs")) {
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
  if (!requireAdmin("Deleting jobs")) {
    return;
  }
  if (!confirm("Delete this job listing?")) {
    return;
  }
  try {
    await deleteDoc(doc(db, "jobs", jobId));
    setJobStatus("Job deleted.");
    await loadData();
  } catch (error) {
    console.error(error);
    setJobStatus(formatAdminError(error, "Unable to delete job. Check admin permissions."));
  }
}

async function toggleJobApproval(jobId) {
  if (!firebaseReady || !db) {
    return;
  }
  if (!requireAdmin("Updating job approval")) {
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

  try {
    await updateDoc(doc(db, "jobs", jobId), {
      approved: !selected.approved,
      updatedAt: serverTimestamp()
    });
    await loadData();
  } catch (error) {
    console.error(error);
    setJobStatus("Unable to update approval. Check admin permissions.");
  }
}

async function toggleCvApproval(cvId) {
  if (!firebaseReady || !db) {
    return;
  }
  if (!requireAdmin("Updating CV approvals")) {
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
  try {
    await updateDoc(doc(db, "cvs", cvId), {
      downloadApproved: !currentApproval,
      updatedAt: serverTimestamp()
    });
    await loadData();
  } catch (error) {
    console.error(error);
    setMaintenanceStatus("Unable to update CV approval. Check admin permissions.");
  }
}

function handleCvListClick(event) {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }
  const action = target.dataset.action;
  const cvId = target.dataset.id;
  if (!cvId || !action) {
    return;
  }
  if (action === "toggle-cv-approval") {
    toggleCvApproval(cvId);
    return;
  }
  if (action === "edit-cv") {
    startEditRecord("cvs", cvId);
    return;
  }
  if (action === "delete-cv") {
    deleteRecord("cvs", cvId);
  }
}

async function verifyPayment(paymentId) {
  if (!firebaseReady || !db) {
    return;
  }
  if (!requireAdmin("Verifying payments")) {
    return;
  }
  try {
    await updateDoc(doc(db, "payments", paymentId), {
      status: "verified",
      verifiedAt: serverTimestamp()
    });
    await loadData();
  } catch (error) {
    console.error(error);
    setMaintenanceStatus("Unable to verify payment. Check admin permissions.");
  }
}

async function deleteRecord(collectionName, recordId) {
  if (!firebaseReady || !db) {
    return;
  }
  if (!requireAdmin("Deleting data")) {
    return;
  }
  const confirmed = confirm("Delete this record? This cannot be undone.");
  if (!confirmed) {
    return;
  }
  try {
    await deleteDoc(doc(db, collectionName, recordId));
    setMaintenanceStatus("Record deleted.");
    await loadData();
  } catch (error) {
    console.error(error);
    setMaintenanceStatus(
      formatAdminError(error, "Unable to delete record. Check admin permissions.")
    );
  }
}

async function startEditRecord(collectionName, recordId) {
  if (!firebaseReady || !db) {
    return;
  }
  if (!requireAdmin("Editing data")) {
    return;
  }
  try {
    const snapshot = await getDoc(doc(db, collectionName, recordId));
    if (!snapshot.exists()) {
      setMaintenanceStatus("Record not found.");
      return;
    }
    openEditPanel(collectionName, recordId, snapshot.data());
  } catch (error) {
    console.error(error);
    setMaintenanceStatus("Unable to load record for editing.");
  }
}

function handlePaymentListClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  const action = target.dataset.action;
  const paymentId = target.dataset.id;
  if (!paymentId || !action) return;
  if (action === "verify-payment") {
    verifyPayment(paymentId);
    return;
  }
  if (action === "edit-payment") {
    startEditRecord("payments", paymentId);
    return;
  }
  if (action === "delete-payment") {
    deleteRecord("payments", paymentId);
  }
}

function handleLetterListClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  const action = target.dataset.action;
  const letterId = target.dataset.id;
  if (!letterId || !action) return;
  if (action === "edit-letter") {
    startEditRecord("letters", letterId);
    return;
  }
  if (action === "delete-letter") {
    deleteRecord("letters", letterId);
  }
}

function handlePortfolioListClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  const action = target.dataset.action;
  const portfolioId = target.dataset.id;
  if (!portfolioId || !action) return;
  if (action === "edit-portfolio") {
    startEditRecord("portfolios", portfolioId);
    return;
  }
  if (action === "delete-portfolio") {
    deleteRecord("portfolios", portfolioId);
  }
}

function handleQrListClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  const action = target.dataset.action;
  const qrId = target.dataset.id;
  if (!qrId || !action) return;
  if (action === "edit-qr") {
    startEditRecord("qrcodes", qrId);
    return;
  }
  if (action === "delete-qr") {
    deleteRecord("qrcodes", qrId);
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
  showDashboard(false);
  if (!isAdminListConfigured()) {
    setLoginStatus(
      "Admin allowlist not configured. Optional: set ADMIN_EMAILS in env.js/Vercel."
    );
  }
}

async function handleAdminAuth(user) {
  if (!user) {
    adminRecordOk = false;
    showDashboard(false);
    closeEditPanel();
    return;
  }

  const email = String(user.email || "").toLowerCase();
  if (isAdminListConfigured() && (!email || !ADMIN_EMAILS.includes(email))) {
    setLoginStatus("Not authorized for admin access.");
    signOutUser();
    return;
  }

  if (REQUIRE_ADMIN_RECORD) {
    const recordOk = await checkAdminRecord(user);
    if (!recordOk) {
      setLoginStatus(
        `Admin record missing. Add admins/${user.uid} in Firestore (enabled: true).`
      );
      signOutUser();
      return;
    }
  } else {
    adminRecordOk = true;
  }

  setLoginStatus("");
  showDashboard(true);
  syncAdminSectionFromHash();
  loadData();
  loadServerIp();
}

function setAdminMenuOpen(open) {
  if (!adminSidebar || !adminMenuToggle) {
    return;
  }
  adminSidebar.classList.toggle("open", open);
  adminMenuToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (adminOverlay) {
    adminOverlay.classList.toggle("open", open);
    adminOverlay.hidden = !open;
  }
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!firebaseReady || !db) {
    setLoginStatus("Firebase is not configured.");
    return;
  }
  if (!isAdminListConfigured()) {
    setLoginStatus(
      "Admin allowlist not configured. Login will rely on Firestore permissions."
    );
  }

  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value.trim();

  if (loginBtn) loginBtn.disabled = true;
  setLoginStatus("Signing in...");

  signInAdmin(email, password)
    .then((user) => handleAdminAuth(user))
    .catch((error) => {
      const code = error?.code || "";
      const message =
        code === "auth/user-not-found"
          ? "Admin user not found. Create the user in Firebase Auth."
          : code === "auth/wrong-password"
          ? "Incorrect password."
          : code === "auth/invalid-credential"
          ? "Invalid credentials."
          : code === "auth/invalid-email"
          ? "Invalid email address."
          : code === "auth/operation-not-allowed"
          ? "Email/Password auth is disabled in Firebase."
          : code === "auth/network-request-failed"
          ? "Network error. Check your connection."
          : "Incorrect admin credentials.";
      setLoginStatus(message);
    })
    .finally(() => {
      if (loginBtn) loginBtn.disabled = false;
    });
});

if (adminMenuToggle && adminSidebar) {
  adminMenuToggle.addEventListener("click", () => {
    const willOpen = !adminSidebar.classList.contains("open");
    setAdminMenuOpen(willOpen);
  });
  adminSidebar.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link) {
      setAdminMenuOpen(false);
    }
  });
}

adminNavLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const target = link.getAttribute("href") || "";
    if (target.startsWith("#")) {
      setActiveAdminSection(target.slice(1));
    }
  });
});

window.addEventListener("hashchange", () => {
  if (!dashboard.hidden) {
    syncAdminSectionFromHash();
  }
});

if (adminOverlay) {
  adminOverlay.addEventListener("click", () => {
    setAdminMenuOpen(false);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && adminSidebar?.classList.contains("open")) {
    setAdminMenuOpen(false);
  }
});

jobForm.addEventListener("submit", saveJob);
jobCancelBtn.addEventListener("click", resetJobForm);
refreshDataBtn.addEventListener("click", loadData);
if (syncJobsBtn) {
  syncJobsBtn.addEventListener("click", triggerJobSync);
}
if (purgeAnonBtn) {
  purgeAnonBtn.addEventListener("click", purgeAnonymousData);
}
if (clearUserDataBtn) {
  clearUserDataBtn.addEventListener("click", clearAllUserData);
}
if (clearJobsBtn) {
  clearJobsBtn.addEventListener("click", clearAllJobs);
}
if (clearJobsAnonBtn) {
  clearJobsAnonBtn.addEventListener("click", clearJobsAndAnonymous);
}
logoutBtn.addEventListener("click", () => {
  signOutUser().finally(() => {
    resetJobForm();
    showDashboard(false);
    closeEditPanel();
    adminRecordOk = false;
  });
});

pendingJobs.addEventListener("click", handleJobListClick);
approvedJobs.addEventListener("click", handleJobListClick);
cvList.addEventListener("click", handleCvListClick);
if (qrList) {
  qrList.addEventListener("click", handleQrListClick);
}
if (letterList) {
  letterList.addEventListener("click", handleLetterListClick);
}
if (portfolioList) {
  portfolioList.addEventListener("click", handlePortfolioListClick);
}
if (paymentList) {
  paymentList.addEventListener("click", handlePaymentListClick);
}
if (editPanelSave) {
  editPanelSave.addEventListener("click", saveEditPanel);
}
if (editPanelCancel) {
  editPanelCancel.addEventListener("click", closeEditPanel);
}

init();

onAuthChange((user) => {
  handleAdminAuth(user);
});
