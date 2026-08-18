"use strict";

(() => {
  const events = new Set(["service_started", "report_viewed", "report_downloaded", "feedback_submitted"]);
  const services = new Set(["general_readiness", "opportunity_match", "funding_discovery", "portfolio_compare", "institution_workspace", "improve_research"]);

  function flowId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
  }

  function record(eventName, serviceKey, id, details = {}) {
    if (!events.has(eventName) || !services.has(serviceKey) || !id) return Promise.resolve(false);
    const payload = { event_name: eventName, service_key: serviceKey, flow_id: id };
    if (eventName === "feedback_submitted" && [1, 2, 3].includes(Number(details.rating))) payload.rating = Number(details.rating);
    return fetch("/api/rafid/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then((response) => response.ok).catch(() => false);
  }

  function start(serviceKey) {
    const id = flowId();
    record("service_started", serviceKey, id);
    return id;
  }

  window.RafidTelemetry = Object.freeze({ flowId, record, start });
})();
