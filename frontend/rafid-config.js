"use strict";

// نقطة واحدة لاسم المنتج والعبارات المشتركة في واجهة النسخة الأولية.
window.RafidConfig = Object.freeze({
  productName: "رافد",
  mvpMode: true,
  copy: Object.freeze({
    busyTitle: "يحلل رافد المحتوى...",
    busyMessage: "يرتب الأدلة والتوصيات دون افتراضات.",
    noPersistence: "لا يُحفَظ الملف أو النص تلقائيًا بعد انتهاء الطلب.",
    unsupportedLegacyView: "هذه الشاشة خارج نطاق النسخة الأولية الحالية.",
    privacyPreviewTitle: "ملخص المحتوى المنقح الذي سيُعالج",
  }),
});

window.addEventListener("DOMContentLoaded", () => {
  const config = window.RafidConfig;
  document.querySelectorAll("[data-product-name]").forEach((element) => {
    element.textContent = config.productName;
  });
  document.title = `${config.productName} | ملاءمة البحث للتمويل`;
});
