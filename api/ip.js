// api/ip.js
// Returns the request IP as seen by the serverless function.

function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    if (first) return first.replace(/^::ffff:/, "");
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) return String(realIp).trim().replace(/^::ffff:/, "");
  const socketIp = req.socket?.remoteAddress;
  if (socketIp) return String(socketIp).trim().replace(/^::ffff:/, "");
  return "unknown";
}

async function getEgressIp() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const ip = String(data?.ip || "").trim();
    return ip || null;
  } catch (error) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  const egressIp = await getEgressIp();
  const ip = egressIp || getRequestIp(req);
  res.status(200).json({
    ip,
    source: egressIp ? "egress" : "request",
    note: "IP may change on serverless platforms."
  });
}
