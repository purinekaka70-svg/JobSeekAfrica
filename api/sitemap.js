// api/sitemap.js
import { getAllJobs } from "./_firebaseAdmin";

export default async function handler(req, res) {
  // Tell the browser and search engines this is XML
  res.setHeader("Content-Type", "application/xml");

  let jobs = [];

  try {
    // Fetch jobs from Firestore
    jobs = await getAllJobs();

    // Ensure jobs is an array
    if (!Array.isArray(jobs)) {
      console.error("getAllJobs() did not return an array");
      jobs = [];
    }
  } catch (error) {
    console.error("Error fetching jobs from Firestore:", error);
    jobs = [];
  }

  // Static pages
  const urls = [
    { loc: "https://jobseekafrica.com/", changefreq: "daily", priority: "1.0" },
    { loc: "https://jobseekafrica.com/jobs.html", changefreq: "daily", priority: "0.9" },
    { loc: "https://jobseekafrica.com/cvbuilder.html", changefreq: "weekly", priority: "0.8" },
    { loc: "https://jobseekafrica.com/coverletter.html", changefreq: "weekly", priority: "0.8" },
    { loc: "https://jobseekafrica.com/qr.html", changefreq: "monthly", priority: "0.5" }
  ];

  // Add job pages dynamically
  jobs.forEach((job) => {
    if (job && job.slug) {
      urls.push({
        loc: `https://jobseekafrica.com/jobs/${job.slug}`,
        changefreq: "daily",
        priority: "0.7"
      });
    }
  });

  // Generate XML sitemap
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `
  <url>
    <loc>${url.loc}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join("")}
</urlset>`;

  // Send sitemap
  res.status(200).send(xml);
}
