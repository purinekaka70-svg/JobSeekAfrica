// api/sitemap.js


export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/xml");

  let jobs = [];

  try {
    jobs = await getAllJobs();
    if (!Array.isArray(jobs)) jobs = [];
  } catch (err) {
    console.error("Firestore fetch failed, continuing with static pages only:", err);
    jobs = [];
  }

  const urls = [
    { loc: "https://jobseekafrica.com/", changefreq: "daily", priority: "1.0" },
    { loc: "https://jobseekafrica.com/jobs.html", changefreq: "daily", priority: "0.9" },
    { loc: "https://jobseekafrica.com/cvbuilder.html", changefreq: "weekly", priority: "0.8" },
    { loc: "https://jobseekafrica.com/coverletter.html", changefreq: "weekly", priority: "0.8" },
    { loc: "https://jobseekafrica.com/portfolio.html", changefreq: "weekly", priority: "0.8" },
    { loc: "https://jobseekafrica.com/qr.html", changefreq: "monthly", priority: "0.6" }
  ];

  const counties = [
    "baringo","bomet","bungoma","busia","elgeyo-marakwet","embu","garissa","homa-bay",
    "isiolo","kajiado","kakamega","kericho","kiambu","kilifi","kirinyaga","kisii","kisumu",
    "kitui","kwale","laikipia","lamu","machakos","makueni","mandera","marsabit","meru",
    "migori","mombasa","muranga","nairobi","nakuru","nandi","narok","nyamira","nyandarua",
    "nyeri","samburu","siaya","taita-taveta","tana-river","tharaka-nithi","trans-nzoia",
    "turkana","uasin-gishu","vihiga","wajir","west-pokot"
  ];

  counties.forEach(county => {
    urls.push({
      loc: `https://jobseekafrica.com/jobs-${county}.html`,
      changefreq: "daily",
      priority: "0.8"
    });
  });

  // Add dynamic jobs safely
  if (jobs.length > 0) {
    jobs.forEach(job => {
      if (job?.slug) {
        urls.push({
          loc: `https://jobseekafrica.com/jobs/${job.slug}`,
          changefreq: "daily",
          priority: "0.7"
        });
      }
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `
  <url>
    <loc>${url.loc}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join("")}
</urlset>`;

  res.status(200).send(xml);
}
