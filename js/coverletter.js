import {
  db,
  firebaseReady,
  getAuthMetadata,
  verifyPaymentAccess,
  recordPayment,
  collection,
  addDoc,
  serverTimestamp
} from "./firebase.js";

const form = document.getElementById("letterForm");
const status = document.getElementById("letterStatus");
const preview = document.getElementById("letterPreview");
const saveBtn = document.getElementById("saveLetterBtn");
const downloadBtn = document.getElementById("downloadLetterBtn");
const copyBtn = document.getElementById("copyLetterBtn");
const regenerateBtn = document.getElementById("regenerateLetterBtn");
const offerBanner = document.getElementById("letterOfferBanner");

const DEFAULT_LETTER_PRICE = 100;
let variationSeed = Date.now();
const letterOfferContext = getLetterOfferContext();

function setStatus(message) {
  if (!status) {
    return;
  }
  status.textContent = message;
}

function getLetterOfferContext() {
  const params = new URLSearchParams(window.location.search);
  const service = String(params.get("service") || "cover_letter").trim() || "cover_letter";
  const rawPrice = Number(params.get("price"));
  return {
    service,
    price: Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : DEFAULT_LETTER_PRICE,
    jobTitle: String(params.get("jobTitle") || "").trim(),
    company: String(params.get("company") || "").trim(),
    jobType: String(params.get("jobType") || "").trim(),
    applyUrl: String(params.get("applyUrl") || "").trim(),
    templateType: String(params.get("templateType") || "").trim()
  };
}

function getLetterPaymentOptions() {
  if (letterOfferContext.price > DEFAULT_LETTER_PRICE || letterOfferContext.service !== "cover_letter") {
    return {
      requiredAmount: letterOfferContext.price,
      allowedSources: [letterOfferContext.service]
    };
  }
  return { requiredAmount: DEFAULT_LETTER_PRICE };
}

function prefillFromJobContext() {
  if (!form) {
    return;
  }
  if (letterOfferContext.jobTitle && !form.jobTitle.value.trim()) {
    form.jobTitle.value = letterOfferContext.jobTitle;
  }
  if (letterOfferContext.company && !form.company.value.trim()) {
    form.company.value = letterOfferContext.company;
  }
  if (letterOfferContext.templateType && form.templateType) {
    form.templateType.value = letterOfferContext.templateType;
  }
}

function showOfferBanner() {
  if (!offerBanner) {
    return;
  }
  if (!letterOfferContext.jobTitle && letterOfferContext.price <= DEFAULT_LETTER_PRICE) {
    offerBanner.hidden = true;
    return;
  }

  const roleLabel =
    letterOfferContext.jobTitle && letterOfferContext.company
      ? `Generating a tailored letter for ${letterOfferContext.jobTitle} at ${letterOfferContext.company}.`
      : "Generate a stronger student-ready cover letter.";
  const sourceLink = letterOfferContext.applyUrl
    ? ` <a href="${letterOfferContext.applyUrl}" target="_blank" rel="noopener noreferrer">Open the original listing</a>.`
    : "";

  offerBanner.innerHTML = `<strong>Application Booster:</strong> ${roleLabel} Price: KES ${letterOfferContext.price}.${sourceLink}`;
  offerBanner.hidden = false;
}

function splitList(text) {
  return text
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFormData() {
  if (!form) {
    return {
      fullName: "",
      email: "",
      phone: "",
      location: "",
      jobTitle: "",
      company: "",
      templateType: "cover",
      letterTemplate: "modern",
      letterLength: "reliable",
      letterPages: "1",
      skills: [],
      experience: "",
      motivation: ""
    };
  }
  return {
    fullName: form.fullName.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    location: form.location.value.trim(),
    jobTitle: form.jobTitle.value.trim(),
    company: form.company.value.trim(),
    templateType: form.templateType.value,
    letterTemplate: form.letterTemplate?.value || "modern",
    letterLength: form.letterLength.value,
    letterPages: form.letterPages?.value || "1",
    skills: splitList(form.skills.value),
    experience: form.experience.value.trim(),
    motivation: form.motivation.value.trim()
  };
}

function buildIntro(data) {
  if (data.templateType === "internship") {
    return `I am a motivated student applying for the ${data.jobTitle} internship at ${data.company}.`;
  }
  if (data.templateType === "graduate") {
    return `I am excited to apply for the ${data.jobTitle} graduate trainee role at ${data.company}.`;
  }
  if (data.templateType === "entry") {
    return `I am excited to apply for the entry-level ${data.jobTitle} role at ${data.company}.`;
  }
  if (data.templateType === "first-time") {
    return `I am a first-time job applicant excited to apply for the ${data.jobTitle} role at ${data.company}.`;
  }
  return `I am excited to apply for the ${data.jobTitle} position at ${data.company}.`;
}

function buildSkillsSentence(skills) {
  if (!skills.length) {
    return "";
  }
  return `My key skills include ${skills.join(", ")}.`;
}

function normalizeLength(length, pages) {
  if (pages === "1" && length === "long") return "medium";
  return length || "reliable";
}

function createRng(seed) {
  let t = seed || Date.now();
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom(list, rng) {
  if (!list.length) return "";
  const idx = Math.floor(rng() * list.length);
  return list[idx];
}

function buildBody(data, rng) {
  const length = normalizeLength(data.letterLength, data.letterPages);

  // Enhanced intro variations with different writing styles
  const introVariations = {
    short: [
      `I am writing to express my interest in the ${data.jobTitle} position at ${data.company}.`,
      `I am excited to apply for the ${data.jobTitle} role with ${data.company}.`,
      `I would like to apply for the ${data.jobTitle} position at ${data.company}.`,
      `I'm applying for the ${data.jobTitle} position at ${data.company} and believe I'm a strong candidate.`,
      `With great enthusiasm, I submit my application for the ${data.jobTitle} role at ${data.company}.`,
      `I am eager to bring my skills to the ${data.jobTitle} position at ${data.company}.`,
      `Please accept my application for the ${data.jobTitle} role at ${data.company}.`,
      `I am keen to join ${data.company} as a ${data.jobTitle} and contribute to your goals.`
    ],
    medium: [
      `I am writing to express my strong interest in the ${data.jobTitle} position at ${data.company}. With my background and passion for this field, I am confident I would be a valuable addition to your team.`,
      `I am excited to apply for the ${data.jobTitle} role at ${data.company}. My skills and experience align well with the requirements of this position.`,
      `I am pleased to submit my application for the ${data.jobTitle} position at ${data.company}. I believe my qualifications and enthusiasm make me an excellent fit for this role.`,
      `Having discovered the ${data.jobTitle} opportunity at ${data.company}, I am compelled to apply. My professional background and dedication to excellence position me well for this role.`,
      `I am enthusiastic about the prospect of joining ${data.company} as a ${data.jobTitle}. My relevant experience and commitment to quality work make me confident in my ability to contribute meaningfully.`,
      `With keen interest in ${data.company}'s mission, I am applying for the ${data.jobTitle} position. I am eager to leverage my skills and experience in this capacity.`,
      `I am writing to apply for the ${data.jobTitle} role at ${data.company}. I bring a strong work ethic and a commitment to growth that aligns with this opportunity.`,
      `I am excited to submit my application for the ${data.jobTitle} position at ${data.company}, where I can contribute and continue learning.`
    ],
    long: [
      `I am writing to express my enthusiastic interest in the ${data.jobTitle} position at ${data.company}. Having researched your organization extensively, I am particularly drawn to your innovative approach and commitment to excellence. I am confident that my background, skills, and passion for this field make me an ideal candidate for this role.`,
      `I am excited to submit my application for the ${data.jobTitle} position at ${data.company}. Your organization's reputation for innovation and excellence resonates with me, and I am eager to contribute my skills and dedication to your continued success.`,
      `After careful consideration of my career goals and ${data.company}'s outstanding reputation, I am thrilled to apply for the ${data.jobTitle} position. I am confident that my unique combination of skills, experience, and passion for this industry will enable me to make significant contributions to your team.`,
      `I am delighted to present my application for the ${data.jobTitle} role at ${data.company}. Your organization's commitment to innovation and excellence aligns perfectly with my professional aspirations and personal values. I am eager to bring my expertise and enthusiasm to contribute to your continued success.`,
      `Having followed ${data.company}'s impressive trajectory in the industry, I am excited to apply for the ${data.jobTitle} position. I am confident that my background, coupled with my genuine passion for this field, will allow me to make meaningful contributions to your organization's objectives.`,
      `I am writing to convey my strong interest in the ${data.jobTitle} position at ${data.company}. Your organization's innovative culture and commitment to excellence have inspired me to pursue this opportunity. I am eager to leverage my skills and experience to support your team's continued success.`,
      `I am excited to apply for the ${data.jobTitle} role at ${data.company} after learning more about your work and impact. I am confident that my experience and motivation align well with your expectations.`,
      `With a clear focus on growth and contribution, I am applying for the ${data.jobTitle} position at ${data.company}. I am eager to bring my strengths and commitment to a team that values excellence.`
    ],
    reliable: [
      `I am writing to apply for the ${data.jobTitle} position at ${data.company}. My background and skills make me well-suited for this role, and I am excited about the opportunity to contribute to your team.`,
      `I am interested in the ${data.jobTitle} position at ${data.company}. With my relevant experience and strong motivation, I believe I would be a valuable addition to your organization.`,
      `I am pleased to submit my application for the ${data.jobTitle} role at ${data.company}. I believe my qualifications and enthusiasm will enable me to contribute effectively to your team.`,
      `Having reviewed the ${data.jobTitle} position at ${data.company}, I am confident that my skills and experience align well with your requirements. I am eager to contribute to your organization's success.`,
      `I am applying for the ${data.jobTitle} position at ${data.company} with great enthusiasm. My background and dedication to excellence make me well-prepared for this role.`,
      `With interest in ${data.company}'s mission, I am submitting my application for the ${data.jobTitle} position. I am confident my skills and experience will be valuable to your team.`,
      `I am applying for the ${data.jobTitle} role at ${data.company}. I am confident I can contribute positively to your organization.`,
      `I would like to be considered for the ${data.jobTitle} position at ${data.company}, where I can apply my skills and grow.`
    ]
  };

  // Enhanced skills variations with different phrasing
  const skillsVariations = {
    short: data.skills.length ? `I possess skills in ${data.skills.slice(0, 3).join(", ")}.` : "",
    medium: data.skills.length ? `My key skills include ${data.skills.join(", ")}, which I believe would be valuable in this role.` : "",
    long: data.skills.length ? `Throughout my academic and professional journey, I have developed strong skills in ${data.skills.join(", ")}. These competencies, combined with my dedication to continuous learning, position me well to contribute effectively to your team.` : "",
    reliable: data.skills.length ? `I bring relevant skills including ${data.skills.join(", ")} that align with the requirements of this position.` : ""
  };

  // Enhanced experience variations with different approaches
  const experienceVariations = {
    short: data.experience ? `I have experience in ${data.experience}.` : "I am eager to apply my knowledge in a practical setting.",
    medium: data.experience ? `My experience includes ${data.experience}, which has prepared me well for this role.` : "I am enthusiastic about gaining hands-on experience and contributing to your team.",
    long: data.experience ? `My experience encompasses ${data.experience}, providing me with practical insights and a strong foundation for success in this position. I am particularly excited about the opportunity to apply these skills in a dynamic environment like ${data.company}.` : "While I may be early in my career, I bring fresh perspectives, strong academic performance, and a genuine enthusiasm for contributing to your organization's goals.",
    reliable: data.experience ? `My background includes ${data.experience}, which has equipped me with the foundation needed for this role.` : "I am motivated to learn and contribute effectively to your team."
  };

  // Enhanced motivation variations with different emotional tones
  const motivationVariations = {
    short: data.motivation ? `I am interested in ${data.company} because ${data.motivation}.` : `I admire ${data.company}'s work.`,
    medium: data.motivation ? `What draws me to ${data.company} is ${data.motivation}. I am eager to contribute to your mission.` : `I am impressed by ${data.company}'s achievements and would welcome the opportunity to contribute.`,
    long: data.motivation ? `What particularly attracts me to ${data.company} is ${data.motivation}. Your organization's commitment to innovation and excellence aligns perfectly with my professional aspirations and personal values. I am genuinely excited about the prospect of joining a team that shares my passion for making a meaningful impact.` : `I am drawn to ${data.company} because of your reputation for excellence and innovation. The opportunity to work with a forward-thinking organization that values growth and development is particularly appealing to me.`,
    reliable: data.motivation ? `I am particularly interested in ${data.company} because ${data.motivation}.` : `I am impressed by ${data.company}'s reputation and would be proud to contribute to your team.`
  };

  // Randomly select variations for uniqueness
  const randomIntro = pickRandom(introVariations[length], rng);
  const randomSkills = skillsVariations[length];
  const randomExperience = experienceVariations[length];
  const randomMotivation = motivationVariations[length];

  const paragraphs = [randomIntro];

  if (randomSkills) paragraphs.push(randomSkills);
  if (randomExperience) paragraphs.push(randomExperience);
  if (randomMotivation) paragraphs.push(randomMotivation);

  return paragraphs.join("\n\n");
}

function buildLetterText(data, seed) {
  const rng = createRng(seed);
  const today = new Date().toLocaleDateString("en-KE", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const letterTypeLabelMap = {
    cover: "Cover Letter",
    application: "Job Application Letter",
    internship: "Internship Application Letter",
    graduate: "Graduate Trainee Application Letter",
    entry: "Entry-level Application Letter",
    "first-time": "First-time Job Applicant Letter"
  };

  const letterTypeLabel = letterTypeLabelMap[data.templateType] || "Job Application Letter";

  const closingMap = {
    modern: "Sincerely,",
    classic: "Yours faithfully,",
    creative: "Warm regards,",
    minimal: "Best regards,",
    student: "Respectfully,"
  };

  const closingLine = closingMap[data.letterTemplate] || "Sincerely,";

  const contact = [data.email, data.phone].filter(Boolean).join(" | ");
  const header = [
    today,
    "",
    data.fullName || "Your Name",
    data.location || "Nairobi, Kenya",
    contact || "email@example.com | +254 700 000 000",
    "",
    "Hiring Manager",
    data.company || "Company Name",
    "",
    `Re: ${letterTypeLabel} - ${data.jobTitle || "Job Application"}`,
    "",
    "Dear Hiring Manager,"
  ];

  const body = buildBody(data, rng);
  const closing = ["", closingLine, data.fullName || "Your Name"];

  return [...header, "", body, ...closing].join("\n");
}

function renderPreview(text) {
  if (!preview) {
    return;
  }
  preview.textContent = text;
}

async function saveLetter() {
  const data = getFormData();
  if (!data.fullName || !data.jobTitle || !data.company) {
    setStatus("Please fill in your name, job title, and company.");
    return;
  }

  if (!firebaseReady || !db) {
    setStatus("Firebase is not configured. Add your config to save letters.");
    return;
  }

  const authMeta = await getAuthMetadata();

  // Check for M-Pesa ref in form (if added to HTML) and save it
  if (form.mpesaRef && form.mpesaRef.value.trim()) {
    const ref = form.mpesaRef.value.trim();
    localStorage.setItem("mpesaRef", ref);
    try {
      await recordPayment(ref, letterOfferContext.service, {
        amount: letterOfferContext.price,
        company: data.company || letterOfferContext.company,
        jobTitle: data.jobTitle || letterOfferContext.jobTitle,
        metadata: {
          jobType: letterOfferContext.jobType || data.templateType
        }
      });
    } catch (e) {
      console.warn("Payment cloud save failed", e);
    }
  }

  const access = await verifyPaymentAccess(getLetterPaymentOptions());
  if (!access.ok) {
    setStatus(access.error || "Enter a verified M-Pesa reference to continue.");
    return;
  }

  const letterText = buildLetterText(data, variationSeed);

  try {
    await addDoc(collection(db, "letters"), {
      ...data,
      letterText,
      uid: authMeta.uid,
      isAnonymous: authMeta.isAnonymous,
      authProvider: authMeta.authProvider,
      createdAt: serverTimestamp()
    });
    setStatus("Cover letter saved.");
  } catch (error) {
    console.error(error);
    setStatus("Unable to save the letter right now.");
  }
}

async function downloadPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    setStatus("PDF library is not loaded. Check your connection.");
    return;
  }

  const data = getFormData();
  if (!data.fullName) {
    setStatus("Add your name before downloading.");
    return;
  }

  const access = await verifyPaymentAccess(getLetterPaymentOptions());
  if (!access.ok) {
    setStatus(access.error || "Enter a verified M-Pesa reference to continue.");
    return;
  }

  const letterText = buildLetterText(data, variationSeed);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  const lines = pdf.splitTextToSize(letterText, 180);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(lines, 14, 16);
  pdf.save(`${data.fullName.replace(/\s+/g, "_")}_Cover_Letter.pdf`);
  setStatus("PDF downloaded.");
}

async function copyLetter() {
  const access = await verifyPaymentAccess(getLetterPaymentOptions());
  if (!access.ok) {
    setStatus(access.error || "Enter a verified M-Pesa reference to continue.");
    return;
  }

  const data = getFormData();
  const letterText = buildLetterText(data, variationSeed);
  try {
    await navigator.clipboard.writeText(letterText);
    setStatus("Cover letter copied to clipboard.");
  } catch (error) {
    console.error(error);
    setStatus("Copy failed. You can select the text in the preview.");
  }
}

function updatePreview() {
  if (!form || !preview) {
    return;
  }
  const data = getFormData();
  const template = data.letterTemplate || "modern";
  preview.className = `letter-preview letter-${template}`;
  renderPreview(buildLetterText(data, variationSeed));
}

if (form && preview) {
  prefillFromJobContext();
  form.addEventListener("input", updatePreview);
  if (saveBtn) saveBtn.addEventListener("click", saveLetter);
  if (downloadBtn) downloadBtn.addEventListener("click", downloadPdf);
  if (copyBtn) copyBtn.addEventListener("click", copyLetter);
  if (regenerateBtn) {
    regenerateBtn.addEventListener("click", () => {
      variationSeed = Date.now();
      updatePreview();
    });
  }

  showOfferBanner();
  updatePreview();
}
