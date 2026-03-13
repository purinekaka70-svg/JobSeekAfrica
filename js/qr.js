import { db, firebaseReady, collection, addDoc, serverTimestamp } from "./firebase.js";

// QR generator: build and download QR codes, plus save records to Firestore.

const form = document.getElementById("qrForm");
const qrText = document.getElementById("qrText");
const qrOutput = document.getElementById("qrOutput");
const downloadLink = document.getElementById("downloadQr");
const useCvLinkBtn = document.getElementById("useCvLink");
const status = document.getElementById("qrStatus");

const LAST_CV_LINK_KEY = "jobseekafrica_last_cv_link";
const LAST_QR_TEXT_KEY = "jobseekafrica_last_qr_text";

function setStatus(message) {
  status.textContent = message;
}

function updateDownloadLink() {
  const canvas = qrOutput.querySelector("canvas");
  const img = qrOutput.querySelector("img");
  if (canvas) {
    downloadLink.href = canvas.toDataURL("image/png");
    return;
  }
  if (img) {
    downloadLink.href = img.src;
    return;
  }
  downloadLink.removeAttribute("href");
}

async function saveQrRecord(text) {
  if (!firebaseReady || !db) {
    return;
  }
  await addDoc(collection(db, "qrcodes"), {
    text,
    createdAt: serverTimestamp(),
    type: "general"
  });
}

function prefillFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("text") || params.get("cvLink");
  const lastSaved = localStorage.getItem(LAST_QR_TEXT_KEY);
  if (fromQuery) {
    qrText.value = decodeURIComponent(fromQuery);
    return true;
  }
  if (lastSaved) {
    qrText.value = lastSaved;
    return true;
  }
  return false;
}

function useLastCvLink() {
  const link = localStorage.getItem(LAST_CV_LINK_KEY);
  if (!link) {
    setStatus("No saved CV link found. Save a CV first.");
    return;
  }
  qrText.value = link;
  setStatus("Loaded your last saved CV link.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = qrText.value.trim();
  if (!value) {
    setStatus("Enter a URL or text to generate a QR code.");
    return;
  }

  qrOutput.innerHTML = "";
  new QRCode(qrOutput, {
    text: value,
    width: 200,
    height: 200,
    colorDark: "#1a1b1f",
    colorLight: "#ffffff"
  });

  localStorage.setItem(LAST_QR_TEXT_KEY, value);
  setTimeout(updateDownloadLink, 200);
  setStatus("QR code generated. You can download it now.");
  await saveQrRecord(value);
});

if (useCvLinkBtn) {
  useCvLinkBtn.addEventListener("click", useLastCvLink);
}

prefillFromQuery();
updateDownloadLink();
