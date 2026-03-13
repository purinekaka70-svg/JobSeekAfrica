import {
  db,
  firebaseReady,
  collection,
  addDoc,
  doc,
  getDoc,
  serverTimestamp
} from "./firebase.js";

// CV Builder logic: live preview, save to Firestore, PDF download, and QR generation.
const env = window.__ENV__ || {};
const requireApproval = String(env.REQUIRE_CV_APPROVAL).toLowerCase() === "true";

const form = document.getElementById("cvForm");
const status = document.getElementById("cvStatus");
const saveBtn = document.getElementById("saveCvBtn");
const downloadBtn = document.getElementById("downloadPdfBtn");
const generateQrBtn = document.getElementById("generateQrBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const cvLinkInput = document.getElementById("cvLink");
const cvQr = document.getElementById("cvQr");

const previewName = document.getElementById("previewName");
const previewContact = document.getElementById("previewContact");
const previewSkills = document.getElementById("previewSkills");
const previewEducation = document.getElementById("previewEducation");
const previewExperience = document.getElementById("previewExperience");

const LAST_CV_LINK_KEY = "jobseekafrica_last_cv_link";

let currentCvId = null;

function setStatus(message) {
  status.textContent = message;
}

// Split comma/newline lists into an array.
function splitList(text) {
  return text
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderList(listEl, items, placeholder) {
  listEl.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = placeholder;
    listEl.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    listEl.appendChild(li);
  });
}

function getFormData() {
  return {
    fullName: form.fullName.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    skills: splitList(form.skills.value),
    education: splitList(form.education.value),
    experience: splitList(form.experience.value)
  };
}

function applyFormData(data) {
  form.fullName.value = data.fullName || "";
  form.email.value = data.email || "";
  form.phone.value = data.phone || "";
  form.skills.value = (data.skills || []).join(", ");
  form.education.value = (data.education || []).join(", ");
  form.experience.value = (data.experience || []).join(", ");
}

function updatePreview(data) {
  previewName.textContent = data.fullName || "Your Name";
  previewContact.textContent =
    data.email && data.phone
      ? `${data.email} | ${data.phone}`
      : "email@example.com | +254 700 000 000";

  renderList(previewSkills, data.skills, "Add your key skills.");
  renderList(previewEducation, data.education, "List your latest education details.");
  renderList(previewExperience, data.experience, "Share relevant internship or job experience.");
}

function buildCvLink(cvId) {
  const base =
    window.location.origin && window.location.origin !== "null"
      ? `${window.location.origin}${window.location.pathname}`
      : window.location.href.split("?")[0];
  return `${base}?cvId=${cvId}`;
}

function persistCvLink(link) {
  localStorage.setItem(LAST_CV_LINK_KEY, link);
}

// Save CV to Firestore so it can be shared and approved.
async function saveCv() {
  if (!firebaseReady || !db) {
    setStatus("Firebase is not configured. Add your config to save CVs.");
    return;
  }

  const data = getFormData();
  if (!data.fullName || !data.email || !data.phone) {
    setStatus("Please fill in your full name, email, and phone.");
    return;
  }

  try {
    const docRef = await addDoc(collection(db, "cvs"), {
      ...data,
      downloadApproved: !requireApproval,
      createdAt: serverTimestamp()
    });
    currentCvId = docRef.id;
    const link = buildCvLink(currentCvId);
    cvLinkInput.value = link;
    persistCvLink(link);
    setStatus(
      requireApproval
        ? "CV saved. Awaiting admin approval before download."
        : "CV saved successfully. Share your link below."
    );
  } catch (error) {
    console.error(error);
    setStatus("Something went wrong while saving. Try again.");
  }
}

// Confirm download permission when approval is required.
async function verifyDownloadApproval() {
  if (!requireApproval) {
    return true;
  }
  if (!firebaseReady || !db) {
    setStatus("Admin approval is required, but Firebase is not configured.");
    return false;
  }
  if (!currentCvId) {
    setStatus("Save your CV first so an admin can approve the download.");
    return false;
  }

  try {
    const snapshot = await getDoc(doc(db, "cvs", currentCvId));
    if (!snapshot.exists()) {
      setStatus("CV record not found. Save again to request approval.");
      return false;
    }
    const data = snapshot.data();
    if (!data.downloadApproved) {
      setStatus("Download awaiting admin approval.");
      return false;
    }
  } catch (error) {
    console.error(error);
    setStatus("Unable to confirm approval right now.");
    return false;
  }

  return true;
}

async function downloadPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    setStatus("PDF library is not loaded. Check your connection.");
    return;
  }

  const data = getFormData();
  if (!data.fullName) {
    setStatus("Add your name before downloading the PDF.");
    return;
  }

  const approved = await verifyDownloadApproval();
  if (!approved) {
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  let y = 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(data.fullName, 14, y);
  y += 8;

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${data.email} | ${data.phone}`, 14, y);
  y += 10;

  const sections = [
    { title: "Skills", items: data.skills },
    { title: "Education", items: data.education },
    { title: "Experience", items: data.experience }
  ];

  sections.forEach((section) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(section.title, 14, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    if (section.items.length === 0) {
      pdf.text("- Not provided", 16, y);
      y += 6;
    } else {
      section.items.forEach((item) => {
        const lines = pdf.splitTextToSize(`- ${item}`, 180);
        pdf.text(lines, 16, y);
        y += lines.length * 6;
      });
    }
    y += 4;
  });

  pdf.save(`${data.fullName.replace(/\s+/g, "_")}_CV.pdf`);
  setStatus("PDF downloaded.");
}

async function generateQr() {
  const link = cvLinkInput.value.trim();
  if (!link) {
    setStatus("Save your CV first to generate a shareable link.");
    return;
  }

  cvQr.innerHTML = "";
  new QRCode(cvQr, {
    text: link,
    width: 180,
    height: 180,
    colorDark: "#1a1b1f",
    colorLight: "#ffffff"
  });

  if (firebaseReady && db) {
    await addDoc(collection(db, "qrcodes"), {
      text: link,
      createdAt: serverTimestamp(),
      type: "cv"
    });
  }

  setStatus("QR code created for your CV link.");
}

async function copyLink() {
  const link = cvLinkInput.value.trim();
  if (!link) {
    setStatus("No CV link to copy yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(link);
    setStatus("Link copied to clipboard.");
  } catch (error) {
    console.error(error);
    setStatus("Copy failed. You can manually select and copy the link.");
  }
}

async function loadCvFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const cvId = params.get("cvId");
  if (!cvId || !firebaseReady || !db) {
    return;
  }

  try {
    const snapshot = await getDoc(doc(db, "cvs", cvId));
    if (!snapshot.exists()) {
      setStatus("CV not found. Create a new CV.");
      return;
    }
    const data = snapshot.data();
    currentCvId = cvId;
    applyFormData(data);
    updatePreview(data);
    const link = buildCvLink(cvId);
    cvLinkInput.value = link;
    persistCvLink(link);
    setStatus("CV loaded from shared link.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to load the CV from the link.");
  }
}

form.addEventListener("input", () => updatePreview(getFormData()));
saveBtn.addEventListener("click", saveCv);
downloadBtn.addEventListener("click", downloadPdf);
generateQrBtn.addEventListener("click", generateQr);
copyLinkBtn.addEventListener("click", copyLink);

updatePreview(getFormData());
loadCvFromQuery();
