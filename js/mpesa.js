import {
  db,
  firebaseReady,
  ensureAuth,
  storeLocalPayment,
  collection,
  addDoc,
  serverTimestamp
} from "./firebase.js";

const env = window.__ENV__ || {};
const MPESA_API_ENDPOINT = env.MPESA_API_ENDPOINT || "/api/mpesa-stk";

const form = document.getElementById("mpesaForm");
const phoneInput = document.getElementById("mpesaPhone");
const refInput = document.getElementById("mpesaRef");
const statusEl = document.getElementById("mpesaStatus");
const submitBtn = document.getElementById("mpesaSubmit");

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b42318" : "";
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!form || !phoneInput || !refInput) return;

  const phone = phoneInput.value.trim();
  const refCode = refInput.value.trim();

  if (!phone) {
    setStatus("Enter a phone number to continue.", true);
    return;
  }

  if (!refCode) {
    setStatus("Enter a reference code to continue.", true);
    return;
  }

  submitBtn.disabled = true;
  setStatus("Processing payment...");

  try {
    // Save payment reference to Firebase
    await savePaymentReference(phone, refCode);

    const response = await fetch(MPESA_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ phone, refCode })
    });

    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Unable to process payment. Try again.", true);
      return;
    }

    setStatus(data.message || "Payment processed successfully.");
    form.reset();
  } catch (error) {
    console.error(error);
    setStatus("Network error. Try again.", true);
  } finally {
    submitBtn.disabled = false;
  }
}

async function savePaymentReference(phone, refCode) {
  if (!firebaseReady || !db) {
    console.log("Firebase not available, payment reference not saved");
    return;
  }
  try {
    const user = await ensureAuth();
    await addDoc(collection(db, "payments"), {
      phone,
      refCode,
      amount: 100,
      currency: "KES",
      status: "pending",
      uid: user ? user.uid : "anonymous",
      createdAt: serverTimestamp()
    });
    storeLocalPayment(refCode);
    console.log("Payment reference saved to Firebase");
  } catch (error) {
    console.error("Error saving payment reference:", error);
  }
}

if (form) {
  form.addEventListener("submit", handleSubmit);
}
