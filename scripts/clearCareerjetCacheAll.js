import process from "node:process";
import { getAdminDb } from "../api/_firebaseAdmin.js";

const COLLECTION_NAME = (process.env.CAREERJET_CACHE_COLLECTION || "careerjet_cache").trim();

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

const batchSize = 400;
let deletedCount = 0;

for (let i = 0; i < snapshot.docs.length; i += batchSize) {
  const batch = db.batch();
  snapshot.docs.slice(i, i + batchSize).forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  deletedCount += Math.min(batchSize, snapshot.docs.length - i);
}

console.log(`Deleted ${deletedCount} cache docs from ${COLLECTION_NAME}.`);
