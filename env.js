// env.js - Environment variables for local development
// IMPORTANT: Replace the placeholder values with your actual API keys

window.__ENV__ = {
  // Get your Careerjet API key from: https://www.careerjet.com/partners/
  // Sign up for a free account and get your API key
  // NOTE: Do not expose your Careerjet API key in client code.
  // Set CAREERJET_API_KEY in Vercel Environment Variables instead.
  CAREERJET_API_KEY: "",
  // Client-side proxy endpoint. For fixed-IP proxy, set to:
  // "https://YOUR_PROXY_DOMAIN/careerjet"
  // Otherwise keep the Vercel serverless endpoint.
  CAREERJET_PROXY_ENDPOINT: "/api/careerjet",
  // Careerjet paging (client-side fetch settings)
  CAREERJET_PAGES: "10",
  CAREERJET_PAGE_SIZE: "50",
  CAREERJET_MAX_JOBS: "300",
  // Default keyword used when search is empty (frontend)
  CAREERJET_FALLBACK_KEYWORD: "driver",
  // Apply button target: "_blank" opens new tab, "_self" opens same tab
  JOBS_APPLY_TARGET: "_blank",
  // How many jobs to render per batch (default 300)
  JOBS_PER_LOAD: "300",

  // Firebase config (optional, for production)
  FIREBASE_API_KEY: "AIzaSyAr7QnrH60uS06raXq6ggP2GA4ldwkrAwo",
  FIREBASE_AUTH_DOMAIN: "jobseekafrica.firebaseapp.com",
  FIREBASE_PROJECT_ID: "jobseekafrica",
  FIREBASE_STORAGE_BUCKET: "jobseekafrica.firebasestorage.app",
  FIREBASE_MESSAGING_SENDER_ID: "891070236152",
  FIREBASE_APP_ID: "1:891070236152:web:b911a362d09f173961020d",
  FIREBASE_MEASUREMENT_ID: "G-QTNFB2RVH0",

  // Admin emails (comma-separated) allowed in the dashboard
  ADMIN_EMAILS: "admin@gmail.com,admin@jobseekafrica.com,purine@gmail.com,purinekaka70@gmail.com",
  // Require admins/{uid} record in Firestore (set false to allow email-only admin login)
  ADMIN_REQUIRE_RECORD: "false",

  // Enable anonymous auth for public users
  ENABLE_ANON_AUTH: "true",

  // Payment session window in minutes (default 20)
  PAYMENT_TTL_MINUTES: "20",

  // Cloud Function endpoint for M-Pesa reference verification
  MPESA_VERIFY_ENDPOINT: "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/verifyMpesaRef",

  // Cloud Function endpoint to manually sync Careerjet jobs
  SYNC_JOBS_ENDPOINT: "/api/syncJobs",
  MANUAL_SYNC_TOKEN: "change_this_secret",
  // Admin endpoint to delete all jobs quickly
  CLEAR_JOBS_ENDPOINT: "/api/clearJobs",
  // After sync, open this URL to show the server IP (or set to "" to disable)
  SYNC_REDIRECT_URL: "/api/ip",
  // "_blank" opens in new tab, "_self" redirects current page
  SYNC_REDIRECT_TARGET: "_blank",
  // After sync, open the user-facing jobs page (set to "" to disable)
  SYNC_SUCCESS_URL: "jobs.html",
  // "_self" stays in the same tab, "_blank" opens a new tab
  SYNC_SUCCESS_TARGET: "_self",

  // Add other environment variables as needed
};
