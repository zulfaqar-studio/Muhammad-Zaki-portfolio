import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { usePortfolio } from "./hooks/usePortfolio";
import Chatbot from "./components/Chatbot";

// The 5 page sections, in scroll order. Each string must match:
//   1. an <section id="..."> below
//   2. the nav button label (nav text is just this string, capitalized by CSS)
// Add/remove a section by editing this array AND the matching <section> below.
const tabs = ["home", "resume", "certification", "work", "project", "contact"];

const WORK_TYPE_META = {
  internship: {
    label: "Internship",
    icon: "⚡",
    color: "var(--work-internship)",
    chip: "work-chip-internship"
  },
  parttime: {
    label: "Part-time",
    icon: "⌛",
    color: "var(--work-parttime)",
    chip: "work-chip-parttime"
  },
  fulltime: {
    label: "Full-time",
    icon: "💼",
    color: "var(--work-fulltime)",
    chip: "work-chip-fulltime"
  }
};

function workMeta(type) {
  return WORK_TYPE_META[type] || WORK_TYPE_META.fulltime;
}

/**
 * PortraitStage — the hero's right-hand visual: a portrait photo card that
 * drifts slightly toward the mouse cursor (a cheap parallax effect done
 * with CSS transforms, no animation library).
 *
 * Set `portraitUrl` on the profile to any accessible image URL:
 *   - Choose/upload a file in the local admin Drive manager; the editor stores a Drive reference.
 *   - Or use any publicly accessible direct image URL.
 *   - Static paths resolve from `client/public`; Drive is used for explicit `drive://FILE_ID` references or matching public Drive filenames.
 */
function PortraitStage({ portraitUrl, portraitFallback }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [portraitUrl]);

  function move(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setOffset({ x: x * 12, y: y * 8 });
  }

  function reset() {
    setOffset({ x: 0, y: 0 });
  }

  return (
    <div className="portrait-stage" onPointerMove={move} onPointerLeave={reset}>
      <div className="grid-floor" aria-hidden="true" />

      <div
        className="portrait-placeholder"
        style={{ transform: `translate3d(${offset.x * 0.35}px, ${offset.y * 0.35}px,0)` }}
      >
        {portraitUrl && !imgFailed ? (
          <img
            className="portrait-image"
            src={portraitUrl}
            alt="Portrait photo"
            onError={(event) => {
              if (portraitFallback && event.currentTarget.src !== portraitFallback) event.currentTarget.src = portraitFallback;
              else setImgFailed(true);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * CertModal — popup shown when a certification card is clicked. Displays
 * the cert's official image (set via the `image` field in portfolio.js) full
 * size, or a friendly placeholder if that cert doesn't have one yet.
 *
 * `key={cert.title}` at the call site (see below) forces React to remount
 * this fresh whenever a *different* cert is opened, so `imgFailed` always
 * starts false instead of carrying over from the previous cert.
 */
function CertModal({ cert, onClose }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(cert.image) && !imgFailed;

  return (
    <div className="cert-modal-overlay" onClick={onClose}>
      {/* Stops the click-to-close on the overlay from also firing when
          clicking inside the modal card itself. */}
      <div
        className="cert-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cert-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="cert-modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="cert-modal-media">
          {showImage ? (
            <img
              src={cert.image}
              alt={`${cert.title} — official certificate`}
              onError={(event) => {
                if (cert.imageFallback && event.currentTarget.src !== cert.imageFallback) event.currentTarget.src = cert.imageFallback;
                else setImgFailed(true);
              }}
            />
          ) : (
            <div className="cert-modal-placeholder">
              <span>No certificate image added yet</span>
              <small>
                Upload it to the public certificate Drive folder and choose the matching file in the local admin.
              </small>
            </div>
          )}
        </div>

        <div className="cert-modal-info">
          <div className="cert-number">{cert.code}</div>
          <div>
            <h3 id="cert-modal-title">{cert.title}</h3>
            <p>{cert.issuer} · {cert.year}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * WorkCard — single horizontal work-experience card. Split into 3 parts:
 *   1. Colored icon strip on the left (color dictated by work.type):
 *        internship -> PURPLE ("⚡")
 *        parttime   -> ORANGE ("⌛")
 *        fulltime   -> BLUE   ("💼")
 *   2. Middle: role + company + 3 short (≈10-word each) bullets.
 *   3. Right: type chip + duration label.
 *
 * The whole thing is a real <button> so Enter / Space click it, and clicking
 * opens WorkModal with the full write-up + media gallery.
 */
function WorkCard({ work, onClick }) {
  const meta = workMeta(work.type);
  return (
    <button
      type="button"
      className="work-card"
      onClick={onClick}
      aria-haspopup="dialog"
      style={{ "--work-accent": meta.color }}
    >
      <div className={`work-icon-wrap ${meta.chip}`}>
        <div className="work-icon" aria-hidden="true">{meta.icon}</div>
      </div>

      <div className="work-copy">
        <div className="work-head">
          <h3>{work.role}</h3>
          <p>{work.company} · {work.location}</p>
        </div>
        <ul className="work-bullets">
          {(work.bullets || []).slice(0, 3).map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      </div>

      <div className="work-side">
        <span className={`work-chip ${meta.chip}`}>{meta.label}</span>
        <span className="work-duration">{work.duration}</span>
        <span className="work-open-hint">Details →</span>
      </div>
    </button>
  );
}

function WorkMediaItem({ item }) {
  if (!item) return null;
  const title = item.title || "";
  switch (item.type) {
    case "image":
      return (
        <figure className="work-media work-media-image">
          <img
            src={item.src}
            alt={title}
            loading="lazy"
            onError={(event) => {
              if (item.srcFallback && event.currentTarget.src !== item.srcFallback) event.currentTarget.src = item.srcFallback;
            }}
          />
          {title ? <figcaption>{title}</figcaption> : null}
        </figure>
      );
    case "video":
      return (
        <figure className="work-media work-media-video">
          <video
          controls
          preload="metadata"
          src={item.src}
          onError={(event) => {
            if (item.srcFallback && event.currentTarget.src !== item.srcFallback) event.currentTarget.src = item.srcFallback;
          }}
        />
          {title ? <figcaption>{title}</figcaption> : null}
        </figure>
      );
    case "youtube":
      return (
        <figure className="work-media work-media-embed">
          <iframe
            src={`https://www.youtube.com/embed/${encodeURIComponent(item.id)}`}
            title={title || "YouTube video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          {title ? <figcaption>{title}</figcaption> : null}
        </figure>
      );
    case "vimeo":
      return (
        <figure className="work-media work-media-embed">
          <iframe
            src={`https://player.vimeo.com/video/${encodeURIComponent(item.id)}`}
            title={title || "Vimeo video"}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
          {title ? <figcaption>{title}</figcaption> : null}
        </figure>
      );
    case "pdf":
      return (
        <figure className="work-media work-media-pdf">
          <iframe src={item.src} title={title || "PDF document"} />
          <figcaption>
            {title || "PDF document"} — <a href={item.src} target="_blank" rel="noreferrer">Open PDF in new tab ↗</a>
          </figcaption>
        </figure>
      );
    default:
      return null;
  }
}

/**
 * WorkModal — expanded popup shown when a WorkCard is clicked. Shows:
 *   - header (role, company, location, type chip, duration)
 *   - 1-paragraph summary + per-paragraph detailed write-up
 *   - media gallery (images, videos, youtube/vimeo embeds, PDFs)
 *   - click anywhere outside the card (or press Escape) to close
 */
function WorkModal({ work, onClose }) {
  const meta = workMeta(work.type);
  const hasMedia = Array.isArray(work.media) && work.media.length > 0;

  return (
    <div className="work-modal-overlay" onClick={onClose}>
      <div
        className="work-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-modal-title"
        style={{ "--work-accent": meta.color }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="work-modal-close" onClick={onClose} aria-label="Close">✕</button>

        <header className="work-modal-head">
          <div className={`work-modal-icon ${meta.chip}`} aria-hidden="true">{meta.icon}</div>
          <div className="work-modal-headline">
            <div className="work-modal-tags">
              <span className={`work-chip ${meta.chip}`}>{meta.label}</span>
              <span className="work-duration-big">{work.duration}</span>
            </div>
            <h2 id="work-modal-title">{work.role}</h2>
            <p className="work-modal-meta">{work.company} · {work.location}</p>
          </div>
        </header>

        <div className="work-modal-body">
          {work.summary ? <p className="work-summary">{work.summary}</p> : null}
          <div className="work-details">
            {(work.details || []).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          {hasMedia ? (
            <section className="work-gallery">
              <h4>Media &amp; documents</h4>
              <div className="work-gallery-grid">
                {work.media.map((m, i) => (
                  <WorkMediaItem key={`${m.type}-${m.src || m.id}-${i}`} item={m} />
                ))}
              </div>
            </section>
          ) : (
            <div className="work-gallery-empty">
              <span>📎</span>
              <p>No media or documents added for this role yet.</p>
              <small>
                Add photos, scans, or clips by putting files in <code>client/public/work/</code>, then
                add entries to the <code>media</code> array for this role in <code>portfolio.js</code>.
              </small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const { profile, resume, certifications, workExperience, projects, skills } = usePortfolio();
  const [active, setActive] = useState("home");         // which nav tab is highlighted
  const [mobileOpen, setMobileOpen] = useState(false);   // hamburger menu open/closed
  const [projectFilter, setProjectFilter] = useState("All"); // selected project tag filter
  const [skillIndex, setSkillIndex] = useState(0);       // which mindset card is expanded
  const [activeCert, setActiveCert] = useState(null);    // which cert's popup is open (null = closed)
  const [activeWork, setActiveWork] = useState(null);    // which work's popup is open (null = closed)

  useEffect(() => {
    if (!skills.length) {
      setSkillIndex(0);
      return;
    }
    if (skillIndex >= skills.length) setSkillIndex(skills.length - 1);
  }, [skills, skillIndex]);

  // Builds the filter button list from whatever tags exist on `projects` in
  // portfolio.js, so you never have to maintain this list by hand — add a
  // new tag to a project's `tags` array and a matching button appears here.
  const projectFilters = useMemo(
    () => ["All", ...new Set(projects.flatMap((p) => Array.isArray(p.tags) ? p.tags : []))],
    [projects]
  );

  const visibleProjects =
    projectFilter === "All"
      ? projects
      : projects.filter((p) => Array.isArray(p.tags) && p.tags.includes(projectFilter));

  useEffect(() => {
    if (projectFilter !== "All" && !projectFilters.includes(projectFilter)) setProjectFilter("All");
  }, [projectFilter, projectFilters]);

  // Points at the certification rail's scrolling <div> (set via ref= below)
  // so the arrow buttons and the wheel handler can scroll it programmatically.
  const certRail = useRef(null);

  // Scrolls the certification rail by ~80% of its own visible width per
  // click — enough to feel like real progress without skipping a card
  // entirely. Negative = left/back, positive = right/forward.
  function scrollCerts(direction) {
    const el = certRail.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  // A plain vertical mouse wheel only ever produces deltaY, so a
  // horizontally-scrolling row like this one would otherwise just look
  // "stuck" to anyone without a trackpad (a two-finger trackpad swipe
  // already produces deltaX and needs no help here). This converts
  // vertical wheel input into horizontal scroll movement while the pointer
  // is over the rail. Uses a real (non-React) event listener with
  // { passive: false } so e.preventDefault() reliably stops the page
  // itself from also scrolling — React's onWheel prop is passive by
  // default and can't guarantee that.
  useEffect(() => {
    const el = certRail.current;
    if (!el) return;

    function onWheel(e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already horizontal input (trackpad) — leave it alone
      el.scrollBy({ left: e.deltaY });
      e.preventDefault();
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Scrollspy: watches each section and marks the nav tab active for
  // whichever one is currently in the middle of the viewport. The
  // rootMargin numbers define that "middle band" — shrink/grow them to
  // change how early or late the nav highlight switches.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 }
    );

    tabs.forEach((tab) => {
      const el = document.getElementById(tab);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Certification popup: Escape closes it, and the page behind it stops
  // scrolling while it's open (otherwise a background scroll + the modal's
  // own scroll fight each other on long content).
  useEffect(() => {
    if (!activeCert) return;

    function onKeyDown(e) {
      if (e.key === "Escape") setActiveCert(null);
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeCert]);

  // Work popup: same pattern as cert popup. Escape closes, page stops scrolling.
  useEffect(() => {
    if (!activeWork) return;

    function onKeyDown(e) {
      if (e.key === "Escape") setActiveWork(null);
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeWork]);

  // Closes the mobile menu (if open) then smooth-scrolls to a section.
  function jump(tab) {
    setMobileOpen(false);
    document.getElementById(tab)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // profile.contacts.email is stored as "mailto:you@example.com" so the <a>
  // href works directly; this strips the "mailto:" prefix back off so the
  // *visible* text on the contact card always matches whatever address is
  // actually configured, instead of a hardcoded placeholder string.
  const emailAddress = (profile.contacts?.email || "").replace(/^mailto:/, "");
  const emailHref = profile.contacts?.email
    ? (profile.contacts.email.includes(":") ? profile.contacts.email : `mailto:${profile.contacts.email}`)
    : "";

  return (
    <div className="site-shell">
      {/* Visually hidden until focused (see .skip-link in styles.css) —
          lets keyboard/screen-reader users jump past the nav bar straight
          to the page content. Standard accessibility pattern, costs nothing
          visually for everyone else. */}
      <a className="skip-link" href="#home">Skip to content</a>

      <header className="nav-shell">
        <a className="wordmark" href="#home" onClick={() => jump("home")}>
          <span className="wordmark-box">MZ</span>
          <span>Muhammad Zaki</span>
        </a>

        <button
          className="mobile-menu"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>

        {/* Section nav, built from the `tabs` array at the top of this
            file. `active` (set by the scrollspy above) controls which
            button gets the .active CSS class. */}
        <nav className={mobileOpen ? "nav open" : "nav"}>
          {tabs.map((tab) => (
            <button key={tab} onClick={() => jump(tab)} className={active === tab ? "active" : ""}>
              {tab}
            </button>
          ))}
        </nav>

        <a className="resume-mini" href={profile.resumeUrl} target="_blank" rel="noreferrer">
          Resume ↗
        </a>
      </header>

      <main>
        {/* ================= HERO ================= */}
        <section id="home" className="hero section">
          <div className="hero-copy">
            <p className="overline">ENGINEERING / TECHNICAL / HANDS-ON</p>
            <h1>{profile.heroTitle || "Make things work."}<br /><em>{profile.heroEmphasis || "Make them work well."}</em></h1>
            <p className="hero-intro">{profile.intro}</p>
            <div className="hero-meta">
              <span>{profile.location}</span>
              <span>•</span>
              <span>{profile.role}</span>
            </div>
            <div className="hero-actions">
              <button className="action-main" onClick={() => jump("project")}>View practical work →</button>
              <a className="action-ghost" href={profile.resumeUrl} target="_blank" rel="noreferrer">
                <span className="a4-chip">A4</span> Resume / print view
              </a>
            </div>
          </div>

          {/* Portrait + the static "mindset" chip below it, grouped so the
              chip flows in normal document flow underneath the portrait
              instead of floating over/around it (that's the whole reason
              this wrapper exists — PortraitStage itself no longer has any
              floating cards left inside it). */}
          <div className="portrait-column">
            <PortraitStage portraitUrl={profile.portraitUrl} portraitFallback={profile.portraitFallback} />
            <div className="mindset-chip">
              <span>MINDSET</span>
              <b>SAFE • CURIOUS • RELIABLE</b>
            </div>
          </div>

          <div className="hero-ribbon">
            <span>WHAT I BRING</span>
            <div>
              {(profile.heroTraits || []).map((trait) => <b key={trait}>{trait}</b>)}
            </div>
          </div>
        </section>

        {/* ================= RESUME ================= */}
        <section id="resume" className="section resume-section">
          <div className="section-heading">
            <div>
              <p className="overline">01 / RESUME</p>
              <h2>A recruiter-ready view of the current resume.</h2>
            </div>
            <p>The wording below follows the current resume, with practical skills and experience kept easy to scan.</p>
          </div>

          <article className="resume-summary-block">
            <p className="overline">PROFESSIONAL SUMMARY</p>
            <p>{resume?.summary || profile.summary}</p>
          </article>

          <div className="resume-grid">
            <article className="resume-card-block">
              <p className="overline">CORE SKILLS</p>
              <div className="resume-skill-groups">
                {[["Rapid Transit & M&E / Technical", resume?.coreSkills?.technical], ["Warehouse Operations", resume?.coreSkills?.warehouse], ["Workplace Skills", resume?.coreSkills?.workplace]].map(([label, items]) => (
                  <div className="resume-skill-group" key={label}>
                    <h3>{label}</h3>
                    <div className="resume-pill-list">{(items || []).map((item) => <span key={item}>{item}</span>)}</div>
                  </div>
                ))}
              </div>
            </article>

            <article className="resume-card-block">
              <p className="overline">EDUCATION</p>
              <div className="resume-education-list">
                {(resume?.education || []).map((item, index) => (
                  <div className="resume-education-item" key={`${item.institution}-${index}`}>
                    <div><h3>{item.institution}</h3><p>{item.programme}</p></div>
                    <span>{item.period}</span>
                    {item.cca ? <small>CCA / role: {item.cca}</small> : null}
                    {(item.achievements || []).map((achievement) => <small key={achievement}>{achievement}</small>)}
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="resume-grid">
            <article className="resume-card-block">
              <p className="overline">CERTIFICATIONS, HONOURS & ACTIVITIES</p>
              <div className="resume-activity-list">{(resume?.certificationsHonoursActivities || []).map((item) => <div className="resume-activity-item" key={item}><span>✓</span><b>{item}</b></div>)}</div>
            </article>

            <article className="resume-card-block">
              <p className="overline">LANGUAGES</p>
              <div className="resume-language-list">{(resume?.languages || []).map((item) => <div key={item.language}><b>{item.language}</b><span>{item.proficiency}</span></div>)}</div>
            </article>
          </div>
        </section>

        {/* ============== CERTIFICATIONS ============== */}
        <section id="certification" className="section">
          <div className="section-heading">
            <div>
              <p className="overline">02 / CERTIFICATION</p>
              <h2>Evidence I keep learning.</h2>
            </div>
            <p>Drag, swipe, scroll, or use the arrows — every certification lives in one row.</p>
          </div>

          {/* ALL certifications in one native horizontally-scrolling rail
              (real overflow-x scrolling, no carousel library). Add/remove
              entries in portfolio.js only — this never needs to change,
              the rail just gets longer or shorter automatically. */}
          <div className="cert-rail-wrap">
            <button className="cert-arrow" onClick={() => scrollCerts(-1)} aria-label="Scroll certifications left">‹</button>

            <div className="cert-rail" ref={certRail} tabIndex={0} aria-label="Certifications">
              {/* Each card is a real <button> (not a <div onClick>) so it's
                  keyboard-focusable and clickable with Enter/Space for free.
                  Clicking opens CertModal with that cert's official image. */}
              {certifications.map((c) => (
                <button
                  type="button"
                  className="cert-card"
                  key={c.title}
                  onClick={() => setActiveCert(c)}
                  aria-haspopup="dialog"
                >
                  <div className="cert-number">{c.code}</div>
                  <div>
                    <h3>{c.title}</h3>
                    <p>{c.issuer} · {c.year}</p>
                  </div>
                </button>
              ))}
            </div>

            <button className="cert-arrow" onClick={() => scrollCerts(1)} aria-label="Scroll certifications right">›</button>
          </div>
        </section>

        {/* ============== WORK EXPERIENCE ============== */}
        <section id="work" className="section work-section">
          <div className="section-heading">
            <div>
              <p className="overline">03 / WORK EXPERIENCE</p>
              <h2>Where I've already put things into practice.</h2>
            </div>
            <p>Each card below opens a write-up with photos, clips and paperwork.</p>
          </div>

          <div className="work-list">
            {(workExperience || []).map((w) => (
              <WorkCard
                key={w.id || w.role + w.company}
                work={w}
                onClick={() => setActiveWork(w)}
              />
            ))}
            {!(workExperience || []).length ? (
              <div className="work-empty">
                <p>No work experience entries yet.</p>
                <small>
                  Add entries to the <code>workExperience</code> array in{" "}
                  <code>portfolio.js</code>.
                </small>
              </div>
            ) : null}
          </div>
        </section>

        {/* ================= PROJECTS ================= */}
        <section id="project" className="section">
          <div className="section-heading">
            <div>
              <p className="overline">04 / PROJECTS</p>
              <h2>Work that shows how I think.</h2>
            </div>
            <p>Tap a skill to see where it appears in the work.</p>
          </div>

          {/* Filter buttons are generated from `projectFilters` above —
              add a new tag to any project in portfolio.js and a button for
              it appears here automatically. */}
          <div className="filter-rail" role="toolbar" aria-label="Project filters">
            {projectFilters.map((tag) => (
              <button
                key={tag}
                className={projectFilter === tag ? "selected" : ""}
                onClick={() => setProjectFilter(tag)}
                aria-pressed={projectFilter === tag}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="project-grid">
            {visibleProjects.map((p, index) => (
              <article className="project-card" key={p.title}>
                <div className="project-top">
                  <span>0{index + 1}</span>
                  <small>{p.status}</small>
                </div>
                <p className="project-type">{p.type}</p>
                <h3>{p.title}</h3>
                <p className="project-description">{p.description}</p>
                <div className="tag-list">
                  {(p.tags || []).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                {p.link ? <a className="project-link" href={p.link} target="_blank" rel="noreferrer">Open project ↗</a> : null}
              </article>
            ))}
          </div>
        </section>

        {/* ============== ENGINEERING MINDSET ============== */}
        <section className="section mindset-section" aria-labelledby="mindset-title">
          <div className="section-heading">
            <div>
              <p className="overline">05 / ENGINEERING MINDSET</p>
              <h2 id="mindset-title">How I approach the work.</h2>
            </div>
            <p>These cards move slowly on purpose — more "workbench" than gimmick.</p>
          </div>

          {/* Left: list of skill rows, driven by the `skills` array in
              portfolio.js. Hovering, focusing (keyboard tab), or clicking a
              row updates `skillIndex`, which controls the detail panel on
              the right. Using onMouseEnter AND onFocus keeps this usable
              with a keyboard, not just a mouse. */}
          <div className="mindset-layout">
            <div className="mindset-list" role="tablist" aria-label="Engineering mindset topics">
              {skills.length ? skills.map((skill, index) => (
                <button
                  className={index === skillIndex ? "mindset-row active" : "mindset-row"}
                  onMouseEnter={() => setSkillIndex(index)}
                  onFocus={() => setSkillIndex(index)}
                  onClick={() => setSkillIndex(index)}
                  role="tab"
                  aria-selected={index === skillIndex}
                  key={skill.id || skill.title || index}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <b>{skill.title}</b>
                  <small>{skill.eyebrow}</small>
                </button>
              )) : (
                <div className="work-empty"><p>No skills added yet.</p><small>The site owner can add skills from the admin page.</small></div>
              )}
            </div>

            <article className="mindset-detail" aria-live="polite">
              <div className="detail-dot" />
              {skills.length ? (
                <>
                  <p>{skills[skillIndex]?.eyebrow}</p>
                  <h3>{skills[skillIndex]?.title}</h3>
                  <strong>{skills[skillIndex]?.description}</strong>
                  <span>{skills[skillIndex]?.detail}</span>
                </>
              ) : (
                <>
                  <p>ENGINEERING MINDSET</p>
                  <h3>Skills will appear here.</h3>
                  <span>Add skills from the admin page to populate this section.</span>
                </>
              )}
              <div className="detail-line">
                <i />
                <i />
                <i />
                <i />
              </div>
            </article>
          </div>
        </section>

        {/* ================= CONTACT ================= */}
        <section id="contact" className="section contact">
          <div className="contact-copy">
            <p className="overline">06 / CONTACT</p>
            <h2>Open to learning, building and contributing.</h2>
            <p>{profile.summary}</p>
          </div>

          <div className="contact-stack">
            {(profile.contactLinks || (() => {
              const legacy = profile.contacts || {};
              return Object.entries(legacy).filter(([, url]) => url).map(([kind, url]) => ({
                id: `legacy-${kind}`,
                kind,
                label: kind === "x" ? "X / Twitter" : kind.charAt(0).toUpperCase() + kind.slice(1),
                description: kind === "email" ? String(url).replace(/^mailto:/, "") : "Contact link",
                url
              }));
            })()).map((item) => (
              <a key={item.id || item.url} href={item.url} target={item.url.startsWith("mailto:") || item.url.startsWith("tel:") ? undefined : "_blank"} rel={item.url.startsWith("mailto:") || item.url.startsWith("tel:") ? undefined : "noreferrer"}>
                <span>{item.label}</span>
                <b>{item.description || item.url} ↗</b>
              </a>
            ))}
          </div>

          <a className="resume-card" href={profile.resumeUrl} target="_blank" rel="noreferrer">
            {/* Real, scannable QR code — encodes profile.resumeUrl
                directly, so updating that one field in portfolio.js keeps
                this in sync automatically; nothing else to configure. It
                sits on a solid white backing (see .resume-qr in
                styles.css) because QR scanners need real light/dark
                contrast — sitting straight on this page's dark background
                would make it unreliable to scan. */}
            <div className="resume-qr">
              <QRCodeSVG
                value={profile.resumeUrl}
                size={72}
                bgColor="#ffffff"
                fgColor="#141414"
                level="M"
                marginSize={0}
                title="Scan to open resume"
              />
            </div>
            <div>
              <p className="overline">PRINTABLE RESUME</p>
              <h3>Scan to open on your phone</h3>
              <span>Or use the Resume ↗ link in the nav bar</span>
            </div>
            <b>↗</b>
          </a>
        </section>
      </main>

      <footer>
        <span>created by <a href="https://github.com/zulfaqar-studio" target="_blank" rel="noreferrer">Zulfaqar Studio</a></span>
        <span>powered by React + Github + Deepseek</span>
        <span>copyright holder by Muhammad Zaki</span>
      </footer>

      {/* Certification popup — only mounted while a cert is selected.
          key={activeCert.title} forces a fresh CertModal (and fresh
          imgFailed state) whenever a different cert is clicked. */}
      {activeCert && (
        <CertModal
          cert={activeCert}
          key={activeCert.title}
          onClose={() => setActiveCert(null)}
        />
      )}

      {/* Work-experience popup. The overlay closes on outside click, while
          WorkModal itself stops click propagation so content remains open.
          Escape + body-scroll locking are handled by the activeWork effect. */}
      {activeWork && (
        <WorkModal
          work={activeWork}
          key={activeWork.id || activeWork.role}
          onClose={() => setActiveWork(null)}
        />
      )}

      <Chatbot />
    </div>
  );
}

export default App;
