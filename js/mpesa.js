const env = window.__ENV__ || {};
const MPESA_API_ENDPOINT = env.MPESA_API_ENDPOINT || "/api/mpesa-stk";

const form = document.getElementById("mpesaForm");
const phoneInput = document.getElementById("mpesaPhone");
const statusEl = document.getElementById("mpesaStatus");
const submitBtn = document.getElementById("mpesaSubmit");

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b42318" : "";
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!form || !phoneInput) return;

  const phone = phoneInput.value.trim();
  if (!phone) {
    setStatus("Enter a phone number to continue.", true);
    return;
  }

  submitBtn.disabled = true;
  setStatus("Sending M-Pesa prompt...");

  try {
    const response = await fetch(MPESA_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ phone })
    });

    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Unable to send prompt. Try again.", true);
      return;
    }

    setStatus(data.message || "Check your phone to complete payment.");
    form.reset();
  } catch (error) {
    console.error(error);
    setStatus("Network error. Try again.", true);
  } finally {
    submitBtn.disabled = false;
  }
}

if (form) {
  form.addEventListener("submit", handleSubmit);
}
