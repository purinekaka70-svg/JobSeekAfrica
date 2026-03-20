// Firebase setup (Firestore only). Uses env.js if present, otherwise falls back to
// the JobSeekAfrica Firebase project config provided by the user.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
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

const PAYMENT_TTL_MINUTES = Number(env.PAYMENT_TTL_MINUTES || 10);
const PAYMENT_TTL_MS = Number.isFinite(PAYMENT_TTL_MINUTES)
  ? Math.max(1, PAYMENT_TTL_MINUTES) * 60 * 1000
  : 10 * 60 * 1000;
const LOCAL_PAYMENT_TS_KEY = "jobseekafrica_payment_ts";
const LOCAL_PAYMENT_REF_KEY = "jobseekafrica_payment_ref";

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

function isPlaceholder(value) {
  if (!value) return true;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("your_") ||
    normalized.includes("yourproject") ||
    normalized.includes("your_project") ||
    normalized.includes("your-project") ||
    normalized === "123456789" ||
    normalized.startsWith("1:123456789") ||
    normalized.includes("abcdef")
  );
}

function pickEnv(envValue, fallbackValue) {
  return isPlaceholder(envValue) ? fallbackValue : envValue;
}

const firebaseConfig = {
  apiKey: pickEnv(env.FIREBASE_API_KEY, defaultConfig.apiKey),
  authDomain: pickEnv(env.FIREBASE_AUTH_DOMAIN, defaultConfig.authDomain),
  projectId: pickEnv(env.FIREBASE_PROJECT_ID, defaultConfig.projectId),
  storageBucket: pickEnv(env.FIREBASE_STORAGE_BUCKET, defaultConfig.storageBucket),
  messagingSenderId: pickEnv(
    env.FIREBASE_MESSAGING_SENDER_ID,
    defaultConfig.messagingSenderId
  ),
  appId: pickEnv(env.FIREBASE_APP_ID, defaultConfig.appId),
  measurementId: pickEnv(env.FIREBASE_MEASUREMENT_ID, defaultConfig.measurementId)
};

const hasConfig =
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.authDomain) &&
  Boolean(firebaseConfig.projectId);

let app = null;
let db = null;
let auth = null;
let firebaseReady = false;
let lastAuthError = null;

if (hasConfig) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  firebaseReady = true;
} else {
  console.warn(
    "Firebase is not configured. Create env.js or inject window.__ENV__ with Firebase keys."
  );
}

const enableAnonAuth = String(env.ENABLE_ANON_AUTH || "true").toLowerCase() === "true";

function safeStorage() {
  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

function storeLocalPayment(refCode) {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(LOCAL_PAYMENT_TS_KEY, String(Date.now()));
  if (refCode) {
    storage.setItem(LOCAL_PAYMENT_REF_KEY, String(refCode).trim());
  }
}

function getLocalPaymentTimestamp() {
  const storage = safeStorage();
  if (!storage) return null;
  const raw = storage.getItem(LOCAL_PAYMENT_TS_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function getLocalPaymentRemainingMs() {
  const ts = getLocalPaymentTimestamp();
  if (!ts) return 0;
  const remaining = PAYMENT_TTL_MS - (Date.now() - ts);
  return Math.max(0, remaining);
}

async function ensureAuth() {
  if (!auth || !enableAnonAuth) {
    return null;
  }
  if (auth.currentUser) {
    return auth.currentUser;
  }
  try {
    const credential = await signInAnonymously(auth);
    lastAuthError = null;
    return credential.user;
  } catch (error) {
    lastAuthError = error;
    console.warn("Anonymous auth failed:", error);
    return null;
  }
}

async function getAuthMetadata() {
  if (!auth) {
    return {
      uid: "anonymous",
      isAnonymous: true,
      authProvider: "none",
      email: null
    };
  }
  const user = await ensureAuth();
  if (!user) {
    return {
      uid: "anonymous",
      isAnonymous: true,
      authProvider: "none",
      email: null
    };
  }
  const provider =
    user.isAnonymous
      ? "anonymous"
      : user.providerData?.[0]?.providerId || "password";
  return {
    uid: user.uid,
    isAnonymous: Boolean(user.isAnonymous),
    authProvider: provider,
    email: user.email || null
  };
}

function onAuthChange(callback) {
  if (!auth) {
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

function formatAuthError(error) {
  const code = error?.code || "";
  if (code === "auth/operation-not-allowed") {
    return "Anonymous Auth is disabled. Enable it in Firebase Console and refresh.";
  }
  if (code === "auth/invalid-api-key") {
    return "Invalid Firebase API key. Check your env.js configuration.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error while signing in. Check your connection.";
  }
  return "Could not identify user session. Please refresh and try again.";
}

async function signInAdmin(email, password) {
  if (!auth) {
    throw new Error("Firebase Auth is not available.");
  }
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

async function signInUser(email, password) {
  return signInAdmin(email, password);
}

async function signUpUser(email, password) {
  if (!auth) {
    throw new Error("Firebase Auth is not available.");
  }
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

async function signOutUser() {
  if (!auth) {
    return;
  }
  await signOut(auth);
}

const MPESA_VERIFY_ENDPOINT =
  env.MPESA_VERIFY_ENDPOINT || "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/verifyMpesaRef";

/**
 * Helper to save payment info consistently to the 'payments' collection
 * so it shows up in the Admin Panel.
 */
async function recordPayment(refCode, service = "general") {
  if (!firebaseReady || !db) return;
  try {
    const authMeta = await getAuthMetadata();
    await addDoc(collection(db, "payments"), {
      refCode: String(refCode).trim(),
      amount: 100,
      currency: "KES",
      source: service,
      status: "pending",
      uid: authMeta.uid,
      isAnonymous: authMeta.isAnonymous,
      authProvider: authMeta.authProvider,
      email: authMeta.email,
      createdAt: serverTimestamp()
    });
    storeLocalPayment(refCode);
  } catch (e) {
    console.error("Error recording payment:", e);
  }
}

async function verifyPaymentAccess() {
  const localRemaining = getLocalPaymentRemainingMs();
  if (localRemaining > 0) {
    return { ok: true, status: "local_cache", remainingMs: localRemaining };
  }

  if (!firebaseReady || !db) {
    return { ok: false, error: "Payment verification service is unavailable." };
  }

  const user = await ensureAuth();
  if (!user) {
    return { ok: false, error: formatAuthError(lastAuthError) };
  }

  try {
    const q = query(collection(db, "payments"), where("uid", "==", user.uid));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      let latestPayment = null;
      let latestTime = 0;
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const createdAt = data.createdAt?.toDate
          ? data.createdAt.toDate()
          : data.createdAt
          ? new Date(data.createdAt)
          : null;
        const time = createdAt && !Number.isNaN(createdAt.getTime())
          ? createdAt.getTime()
          : 0;
        if (!latestPayment || time > latestTime) {
          latestPayment = { data, createdAt };
          latestTime = time;
        }
      });

      if (!latestPayment) {
        return {
          ok: false,
          error: "No payment found for your account. Please save a payment reference on any service page to continue."
        };
      }

      const payment = latestPayment.data;
      const createdAt = latestPayment.createdAt;
      if (!createdAt || Number.isNaN(createdAt.getTime())) {
        storeLocalPayment(payment.refCode);
        return { ok: true, status: "firestore_payment_found" };
      }

      const ageMs = Date.now() - createdAt.getTime();
      if (ageMs <= PAYMENT_TTL_MS) {
        storeLocalPayment(payment.refCode);
        return { ok: true, status: "firestore_recent_payment" };
      }

      return {
        ok: false,
        error: "Payment expired. Please pay again to continue."
      };
    }
    return {
      ok: false,
      error: "No payment found for your account. Please save a payment reference on any service page to continue."
    };
  } catch (error) {
    console.error("Payment verification error:", error);
    return { ok: false, error: "A network error occurred during payment verification." };
  }
}

// Kick off anonymous auth for public pages (if enabled).
if (firebaseReady && enableAnonAuth) {
  ensureAuth();
}

export {
  app,
  auth,
  db,
  firebaseReady,
  ensureAuth,
  getAuthMetadata,
  onAuthChange,
  signInAdmin,
  signInUser,
  signUpUser,
  signOutUser,
  verifyPaymentAccess,
  storeLocalPayment,
  recordPayment,
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp
};
