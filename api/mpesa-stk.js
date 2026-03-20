import { getAdminDb, FieldValue } from "./_firebaseAdmin.js";

// Vercel serverless function to trigger an M-Pesa STK Push prompt.
// Amount is fixed (default 100). User only submits their phone number.

const MPESA_OAUTH_URL = process.env.MPESA_OAUTH_URL;
const MPESA_STK_PUSH_URL = process.env.MPESA_STK_PUSH_URL;
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const MPESA_SHORT_CODE = process.env.MPESA_SHORT_CODE;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;
const MPESA_TRANSACTION_TYPE = process.env.MPESA_TRANSACTION_TYPE;
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL;

const MPESA_AMOUNT = Number(process.env.MPESA_AMOUNT || 100);
const MPESA_ACCOUNT_REFERENCE =
  process.env.MPESA_ACCOUNT_REFERENCE || "JobSeekAfrica";
const MPESA_TRANSACTION_DESC =
  process.env.MPESA_TRANSACTION_DESC || "JobSeekAfrica payment";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function normalizePhone(raw) {
  if (!raw) {
    return null;
  }
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = `254${digits.slice(1)}`;
  }
  if (digits.startsWith("7")) {
    digits = `254${digits}`;
  }
  if (!digits.startsWith("254") || digits.length !== 12) {
    return null;
  }
  return digits;
}

function getTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function getAccessToken() {
  if (!MPESA_OAUTH_URL || !MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
    throw new Error("Missing OAuth configuration.");
  }

  const basic = Buffer.from(
    `${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await fetch(MPESA_OAUTH_URL, {
    headers: {
      Authorization: `Basic ${basic}`
    }
  });

  if (!response.ok) {
    throw new Error("Failed to fetch M-Pesa access token.");
  }

  const data = await response.json();
  return data.access_token;
}

function buildPassword(shortCode, passkey, timestamp) {
  if (!shortCode || !passkey || !timestamp) {
    return "";
  }
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const missing = [];
  if (!MPESA_OAUTH_URL) missing.push("MPESA_OAUTH_URL");
  if (!MPESA_STK_PUSH_URL) missing.push("MPESA_STK_PUSH_URL");
  if (!MPESA_CONSUMER_KEY) missing.push("MPESA_CONSUMER_KEY");
  if (!MPESA_CONSUMER_SECRET) missing.push("MPESA_CONSUMER_SECRET");
  if (!MPESA_SHORT_CODE) missing.push("MPESA_SHORT_CODE");
  if (!MPESA_PASSKEY) missing.push("MPESA_PASSKEY");
  if (!MPESA_TRANSACTION_TYPE) missing.push("MPESA_TRANSACTION_TYPE");
  if (!MPESA_CALLBACK_URL) missing.push("MPESA_CALLBACK_URL");

  if (missing.length) {
    res.status(500).json({ error: `Missing env vars: ${missing.join(", ")}` });
    return;
  }

  const body =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const phone = normalizePhone(body.phone);
  const refCode = body.refCode || null;

  if (!phone) {
    res.status(400).json({ error: "Enter a valid Kenyan phone number." });
    return;
  }

  if (!refCode) {
    res.status(400).json({ error: "Reference code is required." });
    return;
  }

  try {
    const token = await getAccessToken();
    const timestamp = getTimestamp();
    const password = buildPassword(MPESA_SHORT_CODE, MPESA_PASSKEY, timestamp);

    const payload = {
      BusinessShortCode: MPESA_SHORT_CODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: MPESA_TRANSACTION_TYPE,
      Amount: MPESA_AMOUNT,
      PartyA: phone,
      PartyB: MPESA_SHORT_CODE,
      PhoneNumber: phone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: MPESA_ACCOUNT_REFERENCE,
      TransactionDesc: MPESA_TRANSACTION_DESC
    };

    const response = await fetch(MPESA_STK_PUSH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(400).json({ error: "M-Pesa request failed.", details: data });
      return;
    }

    // Optional: store the request in Firestore if admin credentials exist.
    const db = getAdminDb();
    if (db) {
      await db.collection("payments").add({
        phone,
        refCode,
        amount: MPESA_AMOUNT,
        merchantRequestId: data.MerchantRequestID || null,
        checkoutRequestId: data.CheckoutRequestID || null,
        responseCode: data.ResponseCode || null,
        responseDescription: data.ResponseDescription || null,
        customerMessage: data.CustomerMessage || null,
        status: "pending",
        createdAt: FieldValue.serverTimestamp()
      });
    }

    res.status(200).json({
      ok: true,
      message: data.CustomerMessage || "STK Push sent.",
      data
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to trigger M-Pesa prompt." });
  }
}
