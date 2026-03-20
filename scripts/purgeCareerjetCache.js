import process from "node:process";
import { getAdminDb } from "../api/_firebaseAdmin.js";

const COLLECTION_NAME = (process.env.CAREERJET_CACHE_COLLECTION || "careerjet_cache").trim();

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === "function") {
    try {
      return value.toDate().getTime();
    } catch {
      return 0;
    }
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

const db = getAdminDb();
if (!db) {
  console.error("FIREBASE_SERVICE_ACCOUNT is missing or invalid. Aborting.");
  process.exit(1);
}

const snapshot = await db.collection(COLLECTION_NAME).get();
if (snapshot.empty) {
  console.log(`No documents found in ${COLLECTION_NAME}.`);
  process.exit(0);
}

let keepDoc = null;
let keepScore = -1;

snapshot.docs.forEach((doc) => {
  const data = doc.data() || {};
  const fetchedAt = toMillis(data.fetchedAt);
  const expiresAt = toMillis(data.expiresAt);
  const score = Math.max(fetchedAt, expiresAt, 0);
  if (score > keepScore) {
    keepScore = score;
    keepDoc = doc;
  }
});

if (!keepDoc) {
  keepDoc = snapshot.docs[0];
}

const docsToDelete = snapshot.docs.filter((doc) => doc.id !== keepDoc.id);
if (!docsToDelete.length) {
  console.log(`Only one document exists in ${COLLECTION_NAME}. Nothing to delete.`);
  process.exit(0);
}

const batchSize = 400;
let deletedCount = 0;

for (let i = 0; i < docsToDelete.length; i += batchSize) {
  const batch = db.batch();
  docsToDelete.slice(i, i + batchSize).forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  deletedCount += Math.min(batchSize, docsToDelete.length - i);
}

console.log(
  `Deleted ${deletedCount} cache docs from ${COLLECTION_NAME}. Kept ${keepDoc.id}.`
);
