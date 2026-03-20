import {
  db,
  firebaseReady,
  getAuthMetadata,
  verifyPaymentAccess,
  recordPayment,
  collection,
  addDoc,
  doc,
  getDoc,
  serverTimestamp
} from "./firebase.js";

// Portfolio Builder logic: live preview, save to Firestore, and QR generation.
const env = window.__ENV__ || {};

const form = document.getElementById("portfolioForm");
const status = document.getElementById("portfolioStatus");
const saveBtn = document.getElementById("savePortfolioBtn");
const previewBtn = document.getElementById("previewPortfolioBtn");
const generateQrBtn = document.getElementById("generatePortfolioQrBtn");
const copyLinkBtn = document.getElementById("copyPortfolioLinkBtn");
const portfolioLinkInput = document.getElementById("portfolioLink");
const portfolioQr = document.getElementById("portfolioQr");

const previewName = document.getElementById("previewName");
const previewTitle = document.getElementById("previewTitle");
const previewContact = document.getElementById("previewContact");
const previewMeta = document.getElementById("previewMeta");
const previewBio = document.getElementById("previewBio");
const previewSkills = document.getElementById("previewSkills");
const previewProjects = document.getElementById("previewProjects");
const previewExperience = document.getElementById("previewExperience");
const previewEducation = document.getElementById("previewEducation");

const LAST_PORTFOLIO_LINK_KEY = "jobseekafrica_last_portfolio_link";

let currentPortfolioId = null;

function setStatus(message) {
  if (!status) {
    return;
  }
  status.textContent = message;
}

// Split comma/newline lists into an array.
function splitList(text) {
  return text
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// Parse projects into structured data
function parseProjects(text) {
  if (!text.trim()) return [];
  return text.split('\n').map(line => {
    const parts = line.split(':');
    if (parts.length >= 2) {
      return {
        name: parts[0].trim(),
        description: parts.slice(1).join(':').trim()
      };
    }
    return { name: line.trim(), description: '' };
  });
}

// Parse experience into structured data
function parseExperience(text) {
  if (!text.trim()) return [];
  return text.split('\n').map(line => {
    const parts = line.split(',');
    return {
      title: parts[0]?.trim() || '',
      company: parts[1]?.trim() || '',
      duration: parts[2]?.trim() || '',
      description: parts.slice(3).join(',').trim() || ''
    };
  });
}

// Parse education into structured data
function parseEducation(text) {
  if (!text.trim()) return [];
  return text.split('\n').map(line => {
    const parts = line.split(',');
    return {
      degree: parts[0]?.trim() || '',
      university: parts[1]?.trim() || '',
      year: parts[2]?.trim() || ''
    };
  });
}

function getFormData() {
  if (!form) {
    return {
      template: "developer",
      pages: "1",
      fullName: "",
      title: "",
      email: "",
      bio: "",
      skills: [],
      projects: [],
      experience: [],
      education: [],
      uniqueId: generateUniqueId()
    };
  }
  return {
    template: form.portfolioTemplate.value,
    pages: form.portfolioPages?.value || "1",
    fullName: form.fullName.value.trim(),
    title: form.title.value.trim(),
    email: form.email.value.trim(),
    bio: form.bio.value.trim(),
    skills: splitList(form.skills.value),
    projects: parseProjects(form.projects.value),
    experience: parseExperience(form.experience.value),
    education: parseEducation(form.education.value),
    uniqueId: generateUniqueId() // Add unique identifier for each portfolio
  };
}

// Generate unique ID for portfolio uniqueness
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Enhanced bio generation with varied content
function enhanceBio(bio, template) {
  if (!bio.trim()) {
    const bioTemplates = {
      developer: [
        "Passionate software developer with expertise in modern web technologies. I love creating efficient, scalable solutions that solve real-world problems.",
        "Full-stack developer committed to writing clean, maintainable code. I enjoy tackling complex challenges and learning new technologies.",
        "Creative developer who bridges the gap between design and functionality. I build applications that are both beautiful and performant."
      ],
      designer: [
        "Creative designer with a passion for user-centered design. I believe great design solves problems and creates meaningful experiences.",
        "Visual designer focused on creating intuitive and engaging user interfaces. I combine creativity with strategic thinking to deliver exceptional results.",
        "UX/UI designer who loves crafting digital experiences that delight users. I bridge the gap between business goals and user needs."
      ],
      student: [
        "Ambitious student eager to apply classroom knowledge in real-world settings. I'm passionate about learning and contributing to meaningful projects.",
        "Dedicated student with strong academic foundation and practical skills. I'm excited to gain hands-on experience and grow professionally.",
        "Motivated learner with a drive to excel in my field. I'm seeking opportunities to apply my knowledge and develop new competencies."
      ],
      creative: [
        "Creative professional with a unique perspective on problem-solving. I bring fresh ideas and innovative approaches to every project.",
        "Innovative thinker who combines creativity with technical expertise. I enjoy exploring new ways to approach challenges and create value.",
        "Versatile creative professional skilled in multiple disciplines. I thrive on bringing unique visions to life through thoughtful execution."
      ],
      minimal: [
        "Focused professional with clear goals and streamlined approach. I value simplicity, efficiency, and meaningful results.",
        "Minimalist approach to design and development. I believe less is more when it comes to creating impactful solutions.",
        "Clean, efficient professional who prioritizes quality over quantity. I focus on what matters most to deliver exceptional outcomes."
      ]
    };
    return bioTemplates[template]?.[Math.floor(Math.random() * bioTemplates[template].length)] || bioTemplates.developer[0];
  }
  return bio;
}

// Enhanced skills presentation with varied formatting
function enhanceSkills(skills, template) {
  if (!skills.length) {
    const defaultSkills = {
      developer: ["JavaScript", "React", "Node.js", "Python", "Git"],
      designer: ["Figma", "Adobe Creative Suite", "Prototyping", "User Research", "Design Systems"],
      student: ["Microsoft Office", "Research", "Communication", "Problem Solving", "Teamwork"],
      creative: ["Content Creation", "Digital Marketing", "Photography", "Video Editing", "Social Media"],
      minimal: ["Project Management", "Data Analysis", "Communication", "Organization", "Leadership"]
    };
    return defaultSkills[template] || defaultSkills.developer;
  }
  return skills;
}

// Enhanced project descriptions with varied content
function enhanceProjects(projects, template) {
  if (!projects.length) {
    const defaultProjects = {
      developer: [
        {
          name: "E-commerce Platform",
          description: "Built a full-stack e-commerce solution using React, Node.js, and MongoDB. Features include user authentication, payment processing, and admin dashboard."
        },
        {
          name: "Task Management App",
          description: "Developed a collaborative task management application with real-time updates, team collaboration features, and progress tracking."
        }
      ],
      designer: [
        {
          name: "Mobile Banking App",
          description: "Designed a user-friendly mobile banking interface focusing on accessibility, security, and intuitive navigation for diverse user groups."
        },
        {
          name: "Brand Identity System",
          description: "Created a comprehensive brand identity including logo, color palette, typography, and guidelines for consistent brand application."
        }
      ],
      student: [
        {
          name: "Academic Research Project",
          description: "Conducted in-depth research on emerging technologies in my field, analyzing trends and presenting findings to academic peers."
        },
        {
          name: "Group Study Initiative",
          description: "Organized and led study groups for fellow students, developing teaching materials and facilitating collaborative learning sessions."
        }
      ],
      creative: [
        {
          name: "Digital Marketing Campaign",
          description: "Created and executed a multi-channel digital marketing campaign that increased brand awareness and engagement by 40%."
        },
        {
          name: "Content Strategy Project",
          description: "Developed a comprehensive content strategy for a client, including content calendar, social media guidelines, and performance metrics."
        }
      ],
      minimal: [
        {
          name: "Process Optimization",
          description: "Analyzed and streamlined business processes, resulting in 25% efficiency improvement and cost savings."
        },
        {
          name: "Data Visualization Dashboard",
          description: "Designed and implemented a data visualization dashboard that improved decision-making processes for management team."
        }
      ]
    };
    return defaultProjects[template] || defaultProjects.developer;
  }
  return projects;
}

function enhanceExperience(experience, template) {
  if (experience.length) return experience;
  const defaults = {
    developer: [
      { title: "Software Developer", company: "Tech Studio", duration: "2024 - Present", description: "Built web features and improved performance with a focus on clean, maintainable code." }
    ],
    designer: [
      { title: "Product Designer", company: "Creative Lab", duration: "2023 - Present", description: "Designed user-centered interfaces, improving usability and visual consistency." }
    ],
    student: [
      { title: "Student Leader", company: "University Club", duration: "2022 - 2024", description: "Organized events and collaborated with teams to deliver campus initiatives." }
    ],
    creative: [
      { title: "Content Creator", company: "Studio Collective", duration: "2023 - Present", description: "Developed multi-platform content and storytelling concepts for clients." }
    ],
    minimal: [
      { title: "Operations Assistant", company: "Operations Team", duration: "2023 - 2024", description: "Supported process improvements and reporting for daily operations." }
    ]
  };
  return defaults[template] || defaults.developer;
}

function enhanceEducation(education, template) {
  if (education.length) return education;
  const defaults = {
    developer: [{ degree: "BSc Computer Science", university: "University of Nairobi", year: "2022" }],
    designer: [{ degree: "BA Design", university: "Technical University", year: "2021" }],
    student: [{ degree: "BSc Business", university: "University of Nairobi", year: "2024" }],
    creative: [{ degree: "Diploma in Creative Arts", university: "Creative Institute", year: "2020" }],
    minimal: [{ degree: "BA Economics", university: "City University", year: "2022" }]
  };
  return defaults[template] || defaults.developer;
}

function applyFormData(data) {
  form.portfolioTemplate.value = data.template || "developer";
  if (form.portfolioPages) {
    form.portfolioPages.value = data.pages || "1";
  }
  form.fullName.value = data.fullName || "";
  form.title.value = data.title || "";
  form.email.value = data.email || "";
  form.bio.value = data.bio || "";
  form.skills.value = (data.skills || []).join(", ");
  form.projects.value = (data.projects || []).map(p => `${p.name}: ${p.description}`).join("\n");
  form.experience.value = (data.experience || []).map(e => `${e.title}, ${e.company}, ${e.duration}, ${e.description}`).join("\n");
  form.education.value = (data.education || []).map(e => `${e.degree}, ${e.university}, ${e.year}`).join("\n");
}

function renderSkills(skills) {
  previewSkills.innerHTML = "";
  if (!skills.length) {
    const tag = document.createElement("span");
    tag.className = "skill-tag";
    tag.textContent = "Add your skills";
    previewSkills.appendChild(tag);
    return;
  }
  skills.forEach((skill) => {
    const tag = document.createElement("span");
    tag.className = "skill-tag";
    tag.textContent = skill;
    previewSkills.appendChild(tag);
  });
}

function renderProjects(projects) {
  previewProjects.innerHTML = "";
  if (!projects.length) {
    const item = document.createElement("div");
    item.className = "project-item";
    item.innerHTML = "<h4>Project Name</h4><p>Description of your project...</p>";
    previewProjects.appendChild(item);
    return;
  }
  projects.forEach((project) => {
    const item = document.createElement("div");
    item.className = "project-item";
    item.innerHTML = `<h4>${project.name}</h4><p>${project.description || 'No description available'}</p>`;
    previewProjects.appendChild(item);
  });
}

function renderExperience(experience) {
  previewExperience.innerHTML = "";
  if (!experience.length) {
    const item = document.createElement("div");
    item.className = "experience-item";
    item.innerHTML = "<h4>Job Title</h4><p>Company Name</p><p>Description...</p>";
    previewExperience.appendChild(item);
    return;
  }
  experience.forEach((exp) => {
    const item = document.createElement("div");
    item.className = "experience-item";
    item.innerHTML = `<h4>${exp.title}</h4><p>${exp.company} ${exp.duration ? `(${exp.duration})` : ''}</p><p>${exp.description || 'No description available'}</p>`;
    previewExperience.appendChild(item);
  });
}

function renderEducation(education) {
  previewEducation.innerHTML = "";
  if (!education.length) {
    const item = document.createElement("div");
    item.className = "education-item";
    item.innerHTML = "<h4>Degree Name</h4><p>University Name</p><p>Year</p>";
    previewEducation.appendChild(item);
    return;
  }
  education.forEach((edu) => {
    const item = document.createElement("div");
    item.className = "education-item";
    item.innerHTML = `<h4>${edu.degree}</h4><p>${edu.university}</p><p>${edu.year}</p>`;
    previewEducation.appendChild(item);
  });
}

function updatePreview(data) {
  const previewEl = document.getElementById("portfolioPreview");
  if (!previewEl) {
    return;
  }

  // Remove existing template classes
  previewEl.className = 'portfolio-preview';

  // Add template-specific class
  const template = data.template || 'developer';
  previewEl.classList.add(`portfolio-${template}`);

  previewName.textContent = data.fullName || "Your Name";
  previewTitle.textContent = data.title || "Professional Title";
  previewContact.textContent = data.email || "email@example.com";
  if (previewMeta) {
    const pagesLabel = data.pages ? `${data.pages} Page${data.pages === "1" ? "" : "s"}` : "1 Page";
    previewMeta.textContent = `Portfolio: ${pagesLabel}`;
  }
  previewBio.textContent = data.bio || "Your bio will appear here...";

  renderSkills(data.skills);
  renderProjects(data.projects);
  renderExperience(data.experience);
  renderEducation(data.education);
}

function buildPortfolioLink(portfolioId) {
  const base =
    window.location.origin && window.location.origin !== "null"
      ? `${window.location.origin}${window.location.pathname}`
      : window.location.href.split("?")[0];
  return `${base}?portfolioId=${portfolioId}`;
}

async function savePortfolio() {
  const data = getFormData();
  if (!data.fullName || !data.title) {
    setStatus("Please fill in your name and professional title.");
    return;
  }

  if (!firebaseReady || !db) {
    setStatus("Firebase is not configured. Add your config to save portfolios.");
    return;
  }
  const authMeta = await getAuthMetadata();

  // Check for M-Pesa ref in form (if added to HTML) and save it
  if (form.mpesaRef && form.mpesaRef.value.trim()) {
    try {
      const ref = form.mpesaRef.value.trim();
      await recordPayment(ref, "portfolio_builder");
    } catch (e) { console.warn("Payment cloud save failed", e); }
  }
  const access = await verifyPaymentAccess();
  if (!access.ok) {
    setStatus(access.error || "Enter a verified M-Pesa reference to continue.");
    return;
  }

  try {
    await ensureAuth();
    // Enhance portfolio data for uniqueness
    const enhancedData = {
      ...data,
      bio: enhanceBio(data.bio, data.template),
      skills: enhanceSkills(data.skills, data.template),
      projects: enhanceProjects(data.projects, data.template),
      experience: enhanceExperience(data.experience, data.template),
      education: enhanceEducation(data.education, data.template),
      generatedAt: new Date().toISOString(),
      version: "2.0" // Track portfolio version for uniqueness
    };

    const docRef = await addDoc(collection(db, "portfolios"), {
      ...enhancedData,
      uid: authMeta.uid,
      isAnonymous: authMeta.isAnonymous,
      authProvider: authMeta.authProvider,
      createdAt: serverTimestamp()
    });
    currentPortfolioId = docRef.id;
    const link = buildPortfolioLink(currentPortfolioId);
    localStorage.setItem(LAST_PORTFOLIO_LINK_KEY, link);
    setStatus("Portfolio saved successfully with unique content!");
    showPortfolioLink(link);
  } catch (error) {
    console.error(error);
    setStatus("Unable to save the portfolio right now.");
  }
}

function showPortfolioLink(link) {
  if (portfolioLinkInput) {
    portfolioLinkInput.value = link;
    portfolioLinkInput.style.display = "block";
  }
  if (copyLinkBtn) {
    copyLinkBtn.style.display = "inline-block";
  }
  if (generateQrBtn) {
    generateQrBtn.style.display = "inline-block";
  }
}

async function generateQr() {
  const access = await verifyPaymentAccess();
  if (!access.ok) {
    setStatus(access.error || "Enter a verified M-Pesa reference to continue.");
    return;
  }
  if (!currentPortfolioId) {
    const lastLink = localStorage.getItem(LAST_PORTFOLIO_LINK_KEY);
    if (lastLink) {
      currentPortfolioId = lastLink.split('portfolioId=')[1];
    } else {
      setStatus("Save your portfolio first to generate a QR code.");
      return;
    }
  }

  const link = buildPortfolioLink(currentPortfolioId);

  if (!window.QRCode) {
    setStatus("QR code library is not loaded. Check your connection.");
    return;
  }

  if (portfolioQr) {
    portfolioQr.innerHTML = "";
    new QRCode(portfolioQr, {
      text: link,
      width: 128,
      height: 128
    });
    portfolioQr.style.display = "block";
  }
}

async function copyLink() {
  const access = await verifyPaymentAccess();
  if (!access.ok) {
    setStatus(access.error || "Enter a verified M-Pesa reference to continue.");
    return;
  }

  const link = portfolioLinkInput?.value;
  if (!link) {
    setStatus("No link to copy. Save your portfolio first.");
    return;
  }

  try {
    await navigator.clipboard.writeText(link);
    setStatus("Link copied to clipboard!");
  } catch (error) {
    // Fallback for older browsers
    portfolioLinkInput.select();
    document.execCommand("copy");
    setStatus("Link copied to clipboard!");
  }
}

async function loadPortfolio(portfolioId) {
  if (!firebaseReady || !db) {
    setStatus("Firebase is not configured.");
    return;
  }

  try {
    const docRef = doc(db, "portfolios", portfolioId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      applyFormData(data);
      updatePreview(data);
      currentPortfolioId = portfolioId;
      setStatus("Portfolio loaded.");
    } else {
      setStatus("Portfolio not found.");
    }
  } catch (error) {
    console.error(error);
    setStatus("Unable to load the portfolio.");
  }
}

// Event listeners
if (form) {
  form.addEventListener("input", () => {
    const data = getFormData();
    updatePreview(data);
  });
}

if (saveBtn) {
  saveBtn.addEventListener("click", savePortfolio);
}

if (previewBtn) {
  previewBtn.addEventListener("click", () => {
    const data = getFormData();
    updatePreview(data);
  });
}

if (generateQrBtn) {
  generateQrBtn.addEventListener("click", generateQr);
}

if (copyLinkBtn) {
  copyLinkBtn.addEventListener("click", copyLink);
}

// Load portfolio from URL parameter
const urlParams = new URLSearchParams(window.location.search);
const portfolioId = urlParams.get("portfolioId");
if (form) {
  if (portfolioId) {
    loadPortfolio(portfolioId);
  } else {
    // Load last saved portfolio link
    const lastLink = localStorage.getItem(LAST_PORTFOLIO_LINK_KEY);
    if (lastLink && portfolioLinkInput) {
      portfolioLinkInput.value = lastLink;
      portfolioLinkInput.style.display = "block";
      if (copyLinkBtn) copyLinkBtn.style.display = "inline-block";
      if (generateQrBtn) generateQrBtn.style.display = "inline-block";
    }
  }

  // Initial preview
  updatePreview(getFormData());
}
