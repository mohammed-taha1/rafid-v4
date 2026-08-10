"use strict";

(() => {
  const ROUTES = new Set(["how", "faq", "learn", "about", "privacy", "terms", "contact"]);
  const content = () => window.RafidI18n?.isEnglish() ? window.RafidEducationEn : window.RafidEducation;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

  function cards(entries) {
    return `<div class="content-grid">${entries.map(([title, text]) => `<article><h2>${esc(title)}</h2><p>${esc(text)}</p></article>`).join("")}</div>`;
  }

  function page() {
    const key = location.hash.slice(1);
    const root = document.querySelector(".rafid");
    if (!root || !content()) return;
    if (!ROUTES.has(key)) {
      if (root.querySelector(".content-page") && window.RafidApp?.home) window.RafidApp.home();
      return;
    }
    const c = content();
    let title = "";
    let lead = "";
    let body = "";
    if (key === "how") {
      title = "كيف يعمل رافد؟";
      lead = "رحلة واضحة من الملف إلى تقرير يمكن مراجعته وتنفيذه.";
      body = `<ol class="process-list">${c.howItWorks.map((item, index) => `<li><span>${index + 1}</span><div><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p></div></li>`).join("")}</ol>`;
    }
    if (key === "faq") {
      title = "الأسئلة الشائعة";
      lead = "إجابات مباشرة عن الدقة والخصوصية والملفات وطريقة اتخاذ القرار.";
      body = c.faq.map((item, index) => `<details ${index < 2 ? "open" : ""}><summary>${esc(item[0])}</summary><p>${esc(item[1])}</p></details>`).join("");
    }
    if (key === "learn") {
      title = "مركز التعلم";
      lead = "دروس قصيرة تساعدك على تحويل البحث إلى ملف تمويلي أوضح.";
      body = c.lessons.map((item) => `<details><summary>${esc(item.title)}</summary><div class="lesson-body"><p><b>التعريف:</b> ${esc(item.definition)}</p><p><b>لماذا يهم؟</b> ${esc(item.why)}</p><p><b>مثال:</b> ${esc(item.example)}</p><p><b>خطأ شائع:</b> ${esc(item.mistake)}</p><p><b>خطوة عملية:</b> ${esc(item.action)}</p></div></details>`).join("");
    }
    if (key === "about") {
      title = "عن رافد والأثر";
      lead = "نساعد الباحث والمبتكر على رؤية الطريق بين البحث والتمويل والتنفيذ.";
      body = cards(c.about);
    }
    if (key === "privacy") {
      title = "الخصوصية ومعالجة البيانات";
      lead = "ماذا يعالج رافد، وما الذي لا يخزنه، وأين تقع مسؤولية المستخدم.";
      body = `<div class="privacy-banner"><b>الخلاصة</b><p>لا حفظ افتراضي للبحث، ولا تحليل سري إذا لم يكن ZDR مؤكدًا في الوضع الصارم، ولا حاجة لتسجيل الدخول لإجراء التحليل العام.</p></div>${cards(c.privacy)}`;
    }
    if (key === "terms") {
      title = "شروط الاستخدام";
      lead = "حدود واضحة لاستخدام النتيجة بصورة مسؤولة.";
      body = cards(c.terms);
    }
    if (key === "contact") {
      const english = window.RafidI18n?.isEnglish();
      title = english ? "Contact and suggestions" : "تواصل معنا والاقتراحات";
      lead = english ? "Help us improve Rafid through a short, privacy-safe suggestion." : "ساعدنا في تحسين رافد باقتراح مختصر يحترم الخصوصية.";
      body = `<section class="contact-panel"><h2>${english ? "Before sending" : "قبل الإرسال"}</h2><p>${english ? "Do not include research text, personal data, credentials, or confidential information. This form currently prepares a message on your device and does not upload it to Rafid." : "لا تضع نص بحث، أو بيانات شخصية، أو مفاتيح، أو معلومات سرية. النموذج حاليًا يجهز الرسالة على جهازك ولا يرفعها إلى رافد."}</p><form id="contactForm"><label>${english ? "Suggestion" : "الاقتراح"}<textarea id="contactMessage" maxlength="1000" required></textarea></label><button class="rafid-primary" type="submit">${english ? "Copy suggestion" : "نسخ الاقتراح"}</button><p id="contactStatus" role="status"></p></form></section>`;
    }
    root.innerHTML = `<header class="rafid-header"><a class="rafid-logo" href="#home" aria-label="رافد، الصفحة الرئيسية"><span class="brand-logo-crop"><img src="assets/rafid-logo.png" alt="" width="1254" height="1254" /></span><b class="sr-only">رافد</b></a><nav aria-label="التنقل"><a href="#home">الرئيسية</a><a href="#how">كيف يعمل؟</a><a href="#faq">الأسئلة الشائعة</a><a href="#privacy">الخصوصية</a></nav></header><main class="content-page"><div class="content-heading"><span class="rafid-kicker">مركز معرفة رافد</span><h1 tabindex="-1">${esc(title)}</h1><p>${esc(lead)}</p></div>${body}<div class="content-actions"><button id="contentGeneral" class="rafid-primary" type="button">تحليل جاهزية بحث واحد</button><button id="contentMatch" class="rafid-secondary" type="button">مطابقة بحث مع فرصة محددة</button></div></main><footer><div><b>رافد</b><p>الدليل قبل الحكم، والخصوصية جزء من التصميم.</p></div><nav><a href="#about">عن رافد</a><a href="#terms">الشروط</a></nav></footer>`;
    root.querySelector("#contentGeneral").addEventListener("click", () => window.RafidApp?.general());
    root.querySelector("#contentMatch").addEventListener("click", () => window.RafidApp?.match());
    root.querySelector("#contactForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = root.querySelector("#contactMessage").value.trim();
      await navigator.clipboard.writeText(message);
      root.querySelector("#contactStatus").textContent = window.RafidI18n?.isEnglish() ? "Suggestion copied. Share it through Rafid's official channel." : "تم نسخ الاقتراح. أرسله عبر قناة رافد الرسمية.";
    });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    requestAnimationFrame(() => root.querySelector("h1")?.focus({ preventScroll: true }));
  }

  window.addEventListener("hashchange", page);
  window.addEventListener("DOMContentLoaded", () => setTimeout(page, 0));
})();
