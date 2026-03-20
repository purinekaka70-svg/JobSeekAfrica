// api/clearJobs.js
// Deletes all jobs in Firestore using the Admin SDK.

import { getAdminDb } from "./_firebaseAdmin.js";

const JOBS_COLLECTION = (process.env.JOBS_COLLECTION || "jobs").trim();
const MANUAL_SYNC_TOKEN = (process.env.MANUAL_SYNC_TOKEN || "").trim();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token =
    req.query.token ||
    req.headers["x-sync-token"] ||
    req.headers["x-jobseek-token"] ||
    "";

  if (MANUAL_SYNC_TOKEN && token !== MANUAL_SYNC_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Missing FIREBASE_SERVICE_ACCOUNT" });
    }

    let deleted = 0;
    const batchSize = 400;

    while (true) {
      const snap = await db.collection(JOBS_COLLECTION).limit(batchSize).get();
      if (snap.empty) {
        break;
      }
      const batch = db.batch();
      snap.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
      deleted += snap.size;
    }

    return res.status(200).json({ deleted });
  } catch (error) {
    console.error("Clear jobs failed:", error);
    return res.status(500).json({ error: "Delete failed." });
  }
}
