// Firebase setup (Firestore only). Uses env.js if present, otherwise falls back to
// the JobSeekAfrica Firebase project config provided by the user.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// Firebase config is loaded from window.__ENV__ (set in env.js or hosting provider).
const env = window.__ENV__ || {};

// Firebase configuration (env.js overrides the defaults below)
const defaultConfig = {
  apiKey: "AIzaSyAr7QnrH60uS06raXq6ggP2GA4ldwkrAwo",
  authDomain: "jobseekafrica.firebaseapp.com",
  projectId: "jobseekafrica",
  storageBucket: "jobseekafrica.firebasestorage.app",
  messagingSenderId: "891070236152",
  appId: "1:891070236152:web:b911a362d09f173961020d",
  measurementId: "G-QTNFB2RVH0"
};

const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY || defaultConfig.apiKey,
  authDomain: env.FIREBASE_AUTH_DOMAIN || defaultConfig.authDomain,
  projectId: env.FIREBASE_PROJECT_ID || defaultConfig.projectId,
  storageBucket: env.FIREBASE_STORAGE_BUCKET || defaultConfig.storageBucket,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || defaultConfig.messagingSenderId,
  appId: env.FIREBASE_APP_ID || defaultConfig.appId,
  measurementId: env.FIREBASE_MEASUREMENT_ID || defaultConfig.measurementId
};

const hasConfig =
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.authDomain) &&
  Boolean(firebaseConfig.projectId);

let app = null;
let db = null;
let firebaseReady = false;

if (hasConfig) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  firebaseReady = true;
} else {
  console.warn(
    "Firebase is not configured. Create env.js or inject window.__ENV__ with Firebase keys."
  );
}

export {
  app,
  db,
  firebaseReady,
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp
};
