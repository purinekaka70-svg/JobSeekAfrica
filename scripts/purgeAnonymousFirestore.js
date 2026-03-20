import { readFileSync } from "fs";
import { resolve } from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const COLLECTIONS = ["cvs", "letters", "portfolios", "qrcodes", "payments"];
const BATCH_LIMIT = 400;

function getFlagValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function loadServiceAccount() {
  const pathFlag = getFlagValue("--service-account");
  if (pathFlag) {
    const fullPath = resolve(pathFlag);
    const raw = readFileSync(fullPath, "utf-8");
    return JSON.parse(raw);
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    return null;
  }
  try {
    if (raw.trim().startsWith("{")) {
      return JSON.parse(raw);
    }
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (error) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", error.message);
    return null;
  }
}

function initAdmin() {
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    throw new Error(
      "Missing service account. Set FIREBASE_SERVICE_ACCOUNT or pass --service-account path."
    );
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }
}

async function collectAnonymousDocs(db, collectionName) {
  const docMap = new Map();
  const queries = [
    { field: "uid", op: "==", value: "anonymous" },
    { field: "isAnonymous", op: "==", value: true },
    { field: "authProvider", op: "==", value: "anonymous" }
  ];

  for (const q of queries) {
    const snap = await db.collection(collectionName).where(q.field, q.op, q.value).get();
    snap.forEach((docSnap) => {
      docMap.set(docSnap.id, docSnap);
    });
  }

  return Array.from(docMap.values());
}

async function deleteBatch(db, docs, dryRun) {
  let deleted = 0;
  let batch = db.batch();
  let count = 0;

  for (const docSnap of docs) {
    if (!dryRun) {
      batch.delete(docSnap.ref);
      count += 1;
      if (count >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    deleted += 1;
  }

  if (!dryRun && count > 0) {
    await batch.commit();
  }

  return deleted;
}

async function run() {
  const dryRun = hasFlag("--dry-run");
  initAdmin();
  const db = getFirestore();

  let total = 0;
  console.log(dryRun ? "Dry run: no deletes will happen." : "Deleting anonymous data...");

  for (const collectionName of COLLECTIONS) {
    const docs = await collectAnonymousDocs(db, collectionName);
    const deleted = await deleteBatch(db, docs, dryRun);
    total += deleted;
    console.log(`${collectionName}: ${deleted} ${dryRun ? "matched" : "deleted"}`);
  }

  console.log(`Total ${dryRun ? "matched" : "deleted"}: ${total}`);
}

run().catch((error) => {
  console.error("Purge failed:", error.message || error);
  process.exit(1);
});
