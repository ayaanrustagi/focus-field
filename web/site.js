/**
 * DEJA site — print-report motion system.
 * Lenis smooth scroll + GSAP ScrollTrigger.
 * Quiet, editorial: serif lines fade-rise, collage frames drift up with
 * slight parallax, statement scrubs word-by-word, stats count up over
 * their hairlines. [MENU] opens a full-paper overlay.
 */
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var hasGsap = typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined";
    var lenis = null;

    /* ---------- Lenis + GSAP wiring ---------- */
    if (!reduceMotion && typeof Lenis !== "undefined") {
      lenis = new Lenis({
        duration: 1.05,
        easing: function (t) { return 1 - Math.pow(1 - t, 3); },
        smoothWheel: true,
      });
      if (hasGsap) {
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
        gsap.ticker.lagSmoothing(0);
      } else {
        var raf = function (time) { lenis.raf(time); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      }
    }

    /* ---------- [MENU] overlay ---------- */
    var menuBtn = document.getElementById("menuBtn");
    var closeBtn = document.getElementById("closeBtn");
    var overlay = document.getElementById("menuOverlay");

    function setMenu(open) {
      if (!overlay) return;
      overlay.classList.toggle("is-open", open);
      if (menuBtn) menuBtn.setAttribute("aria-expanded", String(open));
      if (lenis) { open ? lenis.stop() : lenis.start(); }
    }
    if (menuBtn) menuBtn.addEventListener("click", function () { setMenu(true); });
    if (closeBtn) closeBtn.addEventListener("click", function () { setMenu(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenu(false);
    });
    if (overlay) {
      overlay.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () { setMenu(false); });
      });
    }

    /* ---------- smooth anchors through Lenis ---------- */
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        if (id.length < 2) return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { offset: -40 });
        else target.scrollIntoView({ behavior: "smooth" });
      });
    });

    /* ---------- topbar hairline once scrolled ---------- */
    var topbar = document.querySelector(".topbar");
    function onScrollTopbar() {
      if (topbar) topbar.classList.toggle("is-stuck", window.scrollY > 60);
    }
    onScrollTopbar();
    window.addEventListener("scroll", onScrollTopbar, { passive: true });
    if (lenis) lenis.on("scroll", onScrollTopbar);

    if (!hasGsap || reduceMotion) return;
    gsap.registerPlugin(ScrollTrigger);

    /* ---------- hero: quiet fade-rise sequence ---------- */
    gsap.utils.toArray(".hero-reveal").forEach(function (el, i) {
      gsap.fromTo(el, { y: 22, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.85, ease: "power2.out", delay: 0.15 + 0.1 * i,
      });
    });

    /* doodles draw in softly */
    gsap.utils.toArray(".hero .doodle").forEach(function (d, i) {
      gsap.fromTo(d, { opacity: 0, scale: 0.85 }, {
        opacity: 1, scale: 1, duration: 0.7, ease: "power2.out", delay: 0.8 + i * 0.15,
      });
    });

    /* ---------- collage frames: rise + gentle parallax ---------- */
    gsap.utils.toArray(".collage-item").forEach(function (item, i) {
      gsap.fromTo(item, { y: 90, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.9, ease: "power2.out", delay: (i % 3) * 0.08,
        scrollTrigger: { trigger: item, start: "top 92%", toggleActions: "play none none none" },
      });
      /* parallax drift — frames float at slightly different rates */
      gsap.to(item, {
        y: (i % 2 === 0 ? -34 : -14),
        ease: "none",
        scrollTrigger: {
          trigger: ".collage",
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    });

    /* ---------- statement: word-by-word scrub ---------- */
    var statementText = document.querySelector(".js-words");
    if (statementText) {
      var words = statementText.textContent.split(/\s+/).filter(Boolean);
      statementText.innerHTML = words
        .map(function (w) { return '<span class="w">' + w + "</span>"; })
        .join(" ");
      gsap.to(statementText.querySelectorAll(".w"), {
        opacity: 1, ease: "none", stagger: 0.05,
        scrollTrigger: { trigger: ".statement", start: "top 75%", end: "center 48%", scrub: 0.4 },
      });
    }

    /* ---------- ledger: count-up serif numerals ---------- */
    gsap.utils.toArray(".ledger__n[data-count]").forEach(function (el) {
      var target = parseFloat(el.getAttribute("data-count"));
      var obj = { n: 0 };
      ScrollTrigger.create({
        trigger: el, start: "top 90%", once: true,
        onEnter: function () {
          gsap.to(obj, {
            n: target, duration: 1.2, ease: "power2.out",
            onUpdate: function () { el.textContent = Math.round(obj.n); },
          });
        },
      });
    });

    /* ---------- generic reveals ---------- */
    gsap.utils.toArray(".reveal").forEach(function (el) {
      gsap.fromTo(el, { y: 26, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 90%", toggleActions: "play none none none" },
        immediateRender: false,
      });
    });

    /* ---------- dock scrollspy ---------- */
    var dockLinks = document.querySelectorAll(".dock a[data-spy]");
    dockLinks.forEach(function (link) {
      var section = document.getElementById(link.getAttribute("data-spy"));
      if (!section) return;
      ScrollTrigger.create({
        trigger: section,
        start: "top center",
        end: "bottom center",
        onToggle: function (self) {
          if (self.isActive) {
            dockLinks.forEach(function (l) { l.classList.remove("is-active"); });
            link.classList.add("is-active");
          }
        },
      });
    });

    window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  });
})();
