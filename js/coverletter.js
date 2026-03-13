import { db, firebaseReady, collection, addDoc, serverTimestamp } from "./firebase.js";

const form = document.getElementById("letterForm");
const status = document.getElementById("letterStatus");
const preview = document.getElementById("letterPreview");
const saveBtn = document.getElementById("saveLetterBtn");
const downloadBtn = document.getElementById("downloadLetterBtn");
const copyBtn = document.getElementById("copyLetterBtn");

function setStatus(message) {
  status.textContent = message;
}

function splitList(text) {
  return text
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFormData() {
  return {
    fullName: form.fullName.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    location: form.location.value.trim(),
    jobTitle: form.jobTitle.value.trim(),
    company: form.company.value.trim(),
    templateType: form.templateType.value,
    skills: splitList(form.skills.value),
    experience: form.experience.value.trim(),
    motivation: form.motivation.value.trim()
  };
}

function buildIntro(data) {
  if (data.templateType === "internship") {
    return `I am a motivated student applying for the ${data.jobTitle} internship at ${data.company}.`;
  }
  if (data.templateType === "graduate") {
    return `I am excited to apply for the ${data.jobTitle} graduate trainee role at ${data.company}.`;
  }
  if (data.templateType === "entry") {
    return `I am excited to apply for the entry-level ${data.jobTitle} role at ${data.company}.`;
  }
  if (data.templateType === "first-time") {
    return `I am a first-time job applicant excited to apply for the ${data.jobTitle} role at ${data.company}.`;
  }
  return `I am excited to apply for the ${data.jobTitle} position at ${data.company}.`;
}

function buildSkillsSentence(skills) {
  if (!skills.length) {
    return "";
  }
  return `My key skills include ${skills.join(", ")}.`;
}

function buildBody(data) {
  const intro = buildIntro(data);
  const skillsSentence = buildSkillsSentence(data.skills);
  const experienceText = data.experience
    ? `Relevant experience includes ${data.experience}.`
    : "I am eager to learn and contribute to your team.";
  const motivationText = data.motivation
    ? `I am interested in ${data.company} because ${data.motivation}`
    : "I admire your organization’s impact and I want to contribute to your goals.";

  return [intro, skillsSentence, experienceText, motivationText].filter(Boolean).join(" ");
}

function buildLetterText(data) {
  const today = new Date().toLocaleDateString("en-KE", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const letterTypeLabelMap = {
    cover: "Cover Letter",
    application: "Job Application Letter",
    internship: "Internship Application Letter",
    graduate: "Graduate Trainee Application Letter",
    entry: "Entry-level Application Letter",
    "first-time": "First-time Job Applicant Letter"
  };

  const letterTypeLabel = letterTypeLabelMap[data.templateType] || "Job Application Letter";

  const contact = [data.email, data.phone].filter(Boolean).join(" | ");
  const header = [
    today,
    "",
    data.fullName || "Your Name",
    data.location || "Nairobi, Kenya",
    contact || "email@example.com | +254 700 000 000",
    "",
    "Hiring Manager",
    data.company || "Company Name",
    "",
    `Re: ${letterTypeLabel} - ${data.jobTitle || "Job Application"}`,
    "",
    "Dear Hiring Manager,"
  ];

  const body = buildBody(data);
  const closing = ["", "Sincerely,", data.fullName || "Your Name"];

  return [...header, "", body, ...closing].join("\n");
}

function renderPreview(text) {
  preview.textContent = text;
}

async function saveLetter() {
  const data = getFormData();
  if (!data.fullName || !data.jobTitle || !data.company) {
    setStatus("Please fill in your name, job title, and company.");
    return;
  }

  const letterText = buildLetterText(data);

  if (!firebaseReady || !db) {
    setStatus("Firebase is not configured. Add your config to save letters.");
    return;
  }

  try {
    await addDoc(collection(db, "letters"), {
      ...data,
      letterText,
      createdAt: serverTimestamp()
    });
    setStatus("Cover letter saved.");
  } catch (error) {
    console.error(error);
    setStatus("Unable to save the letter right now.");
  }
}

async function downloadPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    setStatus("PDF library is not loaded. Check your connection.");
    return;
  }

  const data = getFormData();
  if (!data.fullName) {
    setStatus("Add your name before downloading.");
    return;
  }

  const letterText = buildLetterText(data);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  const lines = pdf.splitTextToSize(letterText, 180);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(lines, 14, 16);
  pdf.save(`${data.fullName.replace(/\s+/g, "_")}_Cover_Letter.pdf`);
  setStatus("PDF downloaded.");
}

async function copyLetter() {
  const data = getFormData();
  const letterText = buildLetterText(data);
  try {
    await navigator.clipboard.writeText(letterText);
    setStatus("Cover letter copied to clipboard.");
  } catch (error) {
    console.error(error);
    setStatus("Copy failed. You can select the text in the preview.");
  }
}

function updatePreview() {
  renderPreview(buildLetterText(getFormData()));
}

form.addEventListener("input", updatePreview);
saveBtn.addEventListener("click", saveLetter);
downloadBtn.addEventListener("click", downloadPdf);
copyBtn.addEventListener("click", copyLetter);

updatePreview();
