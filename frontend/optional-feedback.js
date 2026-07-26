"use strict";
window.RafidOptionalFeedback=Object.freeze({
  mount(root) {
    const box=document.createElement("section");
    box.innerHTML=`<h2>هل كان التحليل مفيدًا؟</h2><p>اختياري؛ لا يرسل نص البحث أو الملف.</p><button data-rate="very_helpful">مفيد جدًا</button><button data-rate="partly_helpful">مفيد جزئيًا</button><button data-rate="not_helpful">غير مفيد</button><label>ملاحظة اختيارية<textarea maxlength="500"></textarea></label><p role="status"></p>`;
    const status=box.querySelector("[role=status]");
    box.querySelectorAll("[data-rate]").forEach(button=>button.addEventListener("click",async()=>{const note=box.querySelector("textarea").value.trim();try{if(!window.rafidSupabase||!window.__rafidFeedbackEnabled){status.textContent="شكرًا لك. التقييم غير متاح حاليًا ولا يؤثر على النتيجة.";return;}const {data}=await window.rafidSupabase.auth.getUser();if(!data?.user)throw Error();const {error}=await window.rafidSupabase.from("rafid_feedback").insert({user_id:data.user.id,rating:button.dataset.rate,note:note||null});if(error)throw error;status.textContent="شكرًا لملاحظتك.";}catch{status.textContent="تعذر إرسال التقييم الآن؛ لا يؤثر ذلك على التحليل.";}}));root.append(box);
  }
});
