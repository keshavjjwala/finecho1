import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { mkdir } from "fs/promises";
import "dotenv/config";
import supabase, { supabaseAdmin } from "./supabase.js";
import callsRouter from "./routes/calls.js";
import clientsRouter from "./routes/clients.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "uploads");
mkdir(UPLOAD_DIR, { recursive: true }).catch(() => { });

const app = express();

app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082', 'http://localhost:8083', 'http://localhost:8084', 'http://localhost:8085', 'http://localhost:8086', 'http://172.18.232.191:8080', 'http://172.18.232.191:8081', 'http://172.18.232.191:8082', 'http://172.18.232.191:8083', 'http://172.18.232.191:8084', 'http://172.18.232.191:8085', 'http://172.18.232.191:8086'],
  credentials: true
}));
app.use(express.json());

// Public routes (no auth required)
app.get("/", (req, res) => {
  res.send("FinEcho backend running");
});

// Public API routes (no auth required)
app.use("/api/calls", callsRouter);
app.use("/api/clients", clientsRouter);
// Note: /api/advisor and /api/dashboard routes are defined inline below

// Summary endpoint (public)
app.post("/api/summary", async (req, res) => {
  const d = req.body;

  console.log("Received summary:", d);

  const { data, error } = await supabase
    .from("summaries")
    .insert([
      {
        call_id: d.callId,
        summary: d.summary,
        goals: d.goals,
        risk_level: d.riskLevel,
        sip_type: d.sip.type,
        sip_amount: d.sip.amount,
        sip_category: d.sip.category,
        risk_explained: d.sip.riskExplained,
        client_response: d.clientResponse,
        compliance: d.compliance,
      },
    ])
    .select(); // 👈 IMPORTANT

  console.log("Supabase data:", data);
  console.log("Supabase error:", error);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    success: true,
    data,
  });
});

app.get("/api/summaries", async (req, res) => {
  const { data, error } = await supabase
    .from("summaries")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});
/** Advisor dashboard stats: prefer calls table, fallback to summaries. */
app.get("/api/advisor/dashboard", async (req, res) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    // Remove user filtering - get all data

    let q = supabaseAdmin.from("calls").select("id, status, compliance_status, created_at");
    if (from) q = q.gte("created_at", from + "T00:00:00.000Z");
    if (to) q = q.lte("created_at", to + "T23:59:59.999Z");
    const { data: callRows, error: callErr } = await q;

    if (!callErr && callRows && callRows.length >= 0) {
      const list = callRows;
      const totalCallsRecorded = list.length;
      const callsProcessedByAI = list.filter((r) => r.status === "completed").length;
      const callsPendingReview = list.filter((r) => r.compliance_status === "warning" || r.compliance_status === "risk").length;
      const complianceFlagsRaised = callsPendingReview;
      const followUpsRequired = 0;
      return res.json({
        totalCallsRecorded,
        callsProcessedByAI,
        callsPendingReview,
        complianceFlagsRaised,
        followUpsRequired,
      });
    }

    let fallback = supabaseAdmin.from("summaries").select("id,call_id,compliance,client_response,created_at");
    if (from) fallback = fallback.gte("created_at", from + "T00:00:00.000Z");
    if (to) fallback = fallback.lte("created_at", to + "T23:59:59.999Z");
    const { data: rows, error } = await fallback;
    if (error) return res.status(500).json({ error: error.message });
    const list = rows || [];
    const needsReview = (v) => v === "needs_review" || (typeof v === "object" && v?.status === "needs_review");
    res.json({
      totalCallsRecorded: list.length,
      callsProcessedByAI: list.length,
      callsPendingReview: list.filter((r) => needsReview(r.compliance)).length,
      complianceFlagsRaised: list.filter((r) => needsReview(r.compliance)).length,
      followUpsRequired: list.filter((r) => String(r.client_response).toLowerCase() === "deferred").length,
    });
  } catch (err) {
    console.error("Advisor dashboard error:", err);
    res.status(500).json({ error: "Dashboard data failed" });
  }
});

/** Legacy dashboard summary (same shape as before for any existing callers). */
app.get("/api/dashboard/summary", async (req, res) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    let q = supabaseAdmin.from("summaries").select("id,call_id,compliance,client_response,created_at");
    if (from) q = q.gte("created_at", from + "T00:00:00.000Z");
    if (to) q = q.lte("created_at", to + "T23:59:59.999Z");
    const { data: rows, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    const list = rows || [];
    const needsReview = (v) => v === "needs_review" || (typeof v === "object" && v?.status === "needs_review");
    res.json({
      totalCalls: list.length,
      summariesGenerated: list.length,
      complianceWarnings: list.filter((r) => needsReview(r.compliance)).length,
      successfulCalls: list.filter((r) => String(r.client_response).toLowerCase() === "proceeded").length,
    });
  } catch (err) {
    res.status(500).json({ error: "Dashboard data failed" });
  }
});

/** List calls (from summaries) for advisor dashboard. */
app.get("/api/advisor/calls", async (req, res) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    let q = supabaseAdmin.from("summaries").select("*").order("created_at", { ascending: false });
    if (from) q = q.gte("created_at", from + "T00:00:00.000Z");
    if (to) q = q.lte("created_at", to + "T23:59:59.999Z");
    const { data: rows, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    const list = rows || [];
    const needsReview = (v) => v === "needs_review" || (typeof v === "object" && v?.status === "needs_review");
    const calls = list.map((r) => ({
      id: r.call_id,
      clientId: r.call_id,
      clientName: "Client",
      advisorName: "Advisor",
      callDate: r.created_at ? r.created_at.slice(0, 10) : "",
      callDuration: 0,
      languageDetected: "—",
      aiProcessingStatus: "processed",
      complianceStatus: needsReview(r.compliance) ? "needs_review" : "clear",
      clientResponse: r.client_response,
    }));
    res.json(calls);
  } catch (err) {
    console.error("Advisor calls error:", err);
    res.status(500).json({ error: "Advisor calls failed" });
  }
});

/** Single summary by call_id for CallSummary page. */
app.get("/api/advisor/calls/:callId/summary", async (req, res) => {
  try {
    const { callId } = req.params;
    const { data: row, error } = await supabaseAdmin
      .from("summaries")
      .select("*")
      .eq("call_id", callId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!row) return res.status(404).json({ error: "Summary not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Summary fetch failed" });
  }
});
console.log("PYTHON_PATH FROM ENV =", process.env.PYTHON_PATH);


const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
