(function () {
  function initNav() {
    const toggles = document.querySelectorAll(".nav-toggle");
    if (!toggles.length) {
      return;
    }

    toggles.forEach((toggle) => {
      const targetId = toggle.getAttribute("aria-controls");
      const nav = targetId ? document.getElementById(targetId) : document.querySelector(".nav");
      if (!nav) return;

      nav.classList.add("nav--collapsible");

      if (!nav.querySelector('a[href="postjob.html"]')) {
        const postLink = document.createElement("a");
        postLink.href = "postjob.html";
        postLink.textContent = "Post a Job";
        const adminLink = nav.querySelector('a[href="admin.html"]');
        if (adminLink) {
          nav.insertBefore(postLink, adminLink);
        } else {
          nav.appendChild(postLink);
        }
      }

      const close = () => {
        nav.classList.remove("nav--open");
        toggle.setAttribute("aria-expanded", "false");
      };

      const open = () => {
        nav.classList.add("nav--open");
        toggle.setAttribute("aria-expanded", "true");
      };

      toggle.addEventListener("click", () => {
        if (nav.classList.contains("nav--open")) {
          close();
        } else {
          open();
        }
      });

      nav.addEventListener("click", (event) => {
        const link = event.target.closest("a");
        if (link) {
          close();
        }
      });

      document.addEventListener("click", (event) => {
        if (!nav.contains(event.target) && !toggle.contains(event.target)) {
          close();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          close();
        }
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth > 720) {
          close();
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNav);
  } else {
    initNav();
  }
})();
