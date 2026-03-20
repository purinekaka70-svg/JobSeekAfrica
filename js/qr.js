import {
  db,
  firebaseReady,
  getAuthMetadata,
  verifyPaymentAccess,
  recordPayment,
  collection,
  addDoc,
  serverTimestamp
} from "./firebase.js";

const form = document.getElementById("qrForm");
const textInput = document.getElementById("qrText");
const useCvLinkBtn = document.getElementById("useCvLink");
const mpesaRefInput = document.getElementById("mpesaRefQr");
const statusEl = document.getElementById("qrStatus");
const outputEl = document.getElementById("qrOutput");
const downloadLink = document.getElementById("downloadQr");

const LAST_CV_LINK_KEY = "jobseekafrica_last_cv_link";

function setStatus(message, isError = false) {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b42318" : "";
}

function setDownloadHref(dataUrl) {
  if (!downloadLink) {
    return;
  }
  downloadLink.href = dataUrl;
  downloadLink.style.display = "inline-block";
}

async function saveMpesaRefIfAny() {
  const ref = mpesaRefInput?.value?.trim();
  if (!ref) {
    return;
  }
  localStorage.setItem("mpesaRef", ref);
  if (!firebaseReady || !db) {
    return;
  }
  await recordPayment(ref, "qr_generator");
}

async function generateQrCode(text) {
  if (!outputEl) {
    return;
  }
  outputEl.innerHTML = "";
  new QRCode(outputEl, {
    text,
    width: 180,
    height: 180,
    colorDark: "#1a1b1f",
    colorLight: "#ffffff"
  });

  // Wait a tick so QRCode can render an <img> or <canvas>.
  setTimeout(() => {
    const img = outputEl.querySelector("img");
    const canvas = outputEl.querySelector("canvas");
    const dataUrl = img ? img.src : canvas ? canvas.toDataURL("image/png") : "";
    if (dataUrl) {
      setDownloadHref(dataUrl);
    }
  }, 50);
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!textInput) {
    return;
  }

  const text = textInput.value.trim();
  if (!text) {
    setStatus("Enter a URL or text to generate a QR code.", true);
    return;
  }

  if (!window.QRCode) {
    setStatus("QR code library is not loaded. Check your connection.", true);
    return;
  }

  await saveMpesaRefIfAny();
  const access = await verifyPaymentAccess();
  if (!access.ok) {
    setStatus(access.error || "Enter a verified M-Pesa reference to continue.", true);
    return;
  }

  await generateQrCode(text);
  setStatus("QR code generated.");

  if (firebaseReady && db) {
    const authMeta = await getAuthMetadata();
    await addDoc(collection(db, "qrcodes"), {
      text,
      type: "general",
      createdAt: serverTimestamp(),
      uid: authMeta.uid,
      isAnonymous: authMeta.isAnonymous,
      authProvider: authMeta.authProvider
    });
  }
}

function loadLastCvLink() {
  if (!textInput) {
    return;
  }
  const link = localStorage.getItem(LAST_CV_LINK_KEY);
  if (!link) {
    setStatus("No saved CV link found yet.", true);
    return;
  }
  textInput.value = link;
  setStatus("Loaded your last CV link.");
}

function init() {
  const storedRef = localStorage.getItem("mpesaRef");
  if (storedRef && mpesaRefInput) {
    mpesaRefInput.value = storedRef;
  }

  if (form) {
    form.addEventListener("submit", handleSubmit);
  }
  if (useCvLinkBtn) {
    useCvLinkBtn.addEventListener("click", loadLastCvLink);
  }
}

init();
