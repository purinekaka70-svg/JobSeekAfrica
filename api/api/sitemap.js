// api/sitemap.js
import { getAllJobs } from "./_firebaseAdmin"; // your function to fetch jobs from Firestore

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/xml");

  const jobs = await getAllJobs(); // fetch jobs from Firestore

  const urls = [
    { loc: "https://jobseekafrica.com/", changefreq: "daily", priority: 1.0 },
    { loc: "https://jobseekafrica.com/jobs.html", changefreq: "daily", priority: 0.9 },
    { loc: "https://jobseekafrica.com/cvbuilder.html", changefreq: "weekly", priority: 0.8 },
    { loc: "https://jobseekafrica.com/coverletter.html", changefreq: "weekly", priority: 0.8 },
    { loc: "https://jobseekafrica.com/qr.html", changefreq: "monthly", priority: 0.5 },
  ];

  // Add all job URLs
  jobs.forEach(job => {
    urls.push({
      loc: `https://jobseekafrica.com/jobs/${job.slug}`,
      changefreq: "daily",
      priority: 0.7,
    });
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `
  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("")}
</urlset>`;

  res.status(200).send(xml);
}
