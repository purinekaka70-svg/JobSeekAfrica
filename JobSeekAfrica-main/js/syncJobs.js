import { getAdminDb, FieldValue } from "./_firebaseAdmin.js";

// Environment variables
const CAREERJET_API_KEY = process.env.CAREERJET_API_KEY;
const MANUAL_SYNC_TOKEN = process.env.MANUAL_SYNC_TOKEN;
const PROXY_URL = process.env.PROXY_URL; // Optional: Set this if Vercel IPs get blocked

// Careerjet API Configuration
const API_URL = "http://public.api.careerjet.net/search";
const LOCALE = "en_KE"; // Adjust for your target region

export default async function handler(req, res) {
  // 1. Security Check
  const token = req.headers["x-sync-token"] || req.query.token;
  if (MANUAL_SYNC_TOKEN && token !== MANUAL_SYNC_TOKEN) {
    return res.status(403).json({ error: "Unauthorized sync request." });
  }

  if (!CAREERJET_API_KEY) {
    return res.status(500).json({ error: "Missing CAREERJET_API_KEY in Vercel env vars." });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Firebase Admin not configured." });
  }

  try {
    // 2. Prepare Request to Careerjet
    const params = new URLSearchParams({
      locale_code: LOCALE,
      keywords: "jobs",
      location: "Kenya",
      sort: "date",
      pagesize: "50", // Fetch batch
      affid: CAREERJET_API_KEY,
      user_ip: "0.0.0.0", // Placeholder IP since Vercel is dynamic
      user_agent: "JobSeekAfrica/1.0"
    });

    // 3. Fetch Data (with optional Proxy support)
    const fetchOptions = {};
    if (PROXY_URL) {
      // If using a static proxy service (like Fixie/QuotaGuard)
      const { HttpsProxyAgent } = await import("https-proxy-agent");
      fetchOptions.agent = new HttpsProxyAgent(PROXY_URL);
    }

    const response = await fetch(`${API_URL}?${params.toString()}`, fetchOptions);
    
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: "Careerjet API failed", details: text });
    }

    const data = await response.json();
    const jobs = data.jobs || [];

    if (!jobs.length) {
      return res.status(200).json({ message: "No new jobs found to sync." });
    }

    // 4. Persist to Firestore (Batch Write)
    const batch = db.batch();
    const collectionRef = db.collection("jobs");
    let savedCount = 0;

    jobs.forEach((job) => {
      if (!job.url) return;
      
      // Create a deterministic ID from the URL to prevent duplicates
      const jobId = "cj_" + Buffer.from(job.url).toString("base64").replace(/[=/+]/g, "").slice(0, 30);
      const docRef = collectionRef.doc(jobId);

      batch.set(docRef, {
        title: job.title,
        company: job.company,
        location: job.locations || "Kenya",
        county: (job.locations || "").split(",")[0].trim() || "Nationwide",
        description: job.description,
        applyUrl: job.url,
        type: "Full-time", // Default as API might not provide type
        category: "General",
        approved: true, // Auto-approve synced jobs
        source: "Careerjet Sync",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true }); // Update if exists

      savedCount++;
    });

    await batch.commit();

    return res.status(200).json({ message: "Sync successful", saved: savedCount });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}