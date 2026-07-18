"use strict";

const { chromium } = require("playwright");

async function main() {
  const target = process.argv[2] || "http://127.0.0.1:8123";
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(target, { waitUntil: "networkidle" });
  await page.click("#loadDemoBtn");
  await page.waitForSelector('#portfolioContent:not(.hidden)');
  const rows = await page.locator("#portfolioRows tr").count();
  if (rows !== 3) throw new Error(`Expected 3 demo projects, received ${rows}.`);
  const lastProject = await page.locator("#portfolioRows tr").last().locator(".project-cell b").textContent();
  if (!lastProject.includes("الشبكية")) {
    throw new Error("The high-scoring ineligible project was not sorted after eligible/conditional projects.");
  }

  await page.click('[data-view-link="projects"]');
  await page.fill("#projectSourceInput", "مشروع تجريبي يحتوي معلومات كافية لفتح بوابة الخصوصية دون إرسال أي طلب.");
  await page.fill("#projectTitleInput", "اختبار الخصوصية");
  await page.click("#extractProjectBtn");
  await page.waitForSelector("#privacyModal:not([hidden])");
  await page.selectOption("#privacyClassification", "restricted");
  await page.check("#privacyConfirm");
  if (!(await page.locator("#confirmPrivacyBtn").isDisabled())) {
    throw new Error("Restricted content was not blocked in the privacy gateway.");
  }
  await page.click("#cancelPrivacyBtn");

  await page.click('[data-view-link="review"]');
  await page.selectOption("#reviewProjectSelect", "demo-project-a");
  await page.waitForSelector("#reviewContent:not(.hidden)");
  await page.screenshot({ path: "/tmp/rafid-v4-ui.png", fullPage: true });
  await browser.close();

  if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
  console.log("Rafid UI smoke test passed: demo, sorting, privacy block, and review flow.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
