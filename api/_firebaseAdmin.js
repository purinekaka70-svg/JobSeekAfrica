import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Optional Firestore Admin helper for Vercel serverless functions.
// If FIREBASE_SERVICE_ACCOUNT is not provided, this returns null and the API
// will still work without storing anything in Firestore.

let cachedDb = null;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    return null;
  }

  try {
    // Allow either JSON string or base64 encoded JSON.
    if (raw.trim().startsWith("{")) {
      return JSON.parse(raw);
    }
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (error) {
    console.warn("Unable to parse FIREBASE_SERVICE_ACCOUNT.", error);
    return null;
  }
}

export function getAdminDb() {
  if (cachedDb) {
    return cachedDb;
  }

  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) {
    return null;
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount)
    });
  }

  cachedDb = getFirestore();
  return cachedDb;
}

export { FieldValue };
