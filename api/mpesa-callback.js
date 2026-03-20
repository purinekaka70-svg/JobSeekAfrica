import { getAdminDb, FieldValue } from "./_firebaseAdmin.js";

// Callback endpoint for M-Pesa STK Push results.
// Save the callback payload to Firestore when admin credentials are available.

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

  try {
    const payload =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const db = getAdminDb();

    if (db) {
      await db.collection("payments").add({
        type: "callback",
        payload,
        status: "received",
        createdAt: FieldValue.serverTimestamp()
      });
    }

    // M-Pesa expects a simple acknowledgement.
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ResultCode: 1, ResultDesc: "Server error" });
  }
}
