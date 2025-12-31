import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
    FileText,
    AlertTriangle,
    Clock,
    CheckSquare,
    Loader2,
    Sparkles,
    RefreshCcw,
    ShieldAlert,
    Users,
    MapPin,
    Wand2,
} from "lucide-react";

type TimeRange = "current_shift" | "last_24h" | "last_7d";
type SeverityFocus = "all" | "high_only";

type Report = {
    incidentExplanations: string[];
    shiftSummary: string;
    actionChecklist: { incident: string; actions: string[] }[];
    raw?: string;
};

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const GEMINI_ENDPOINT = (model: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function extractPlainTextFromGemini(json: any): string {
    const parts = json?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
        return parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("\n").trim();
    }
    return "";
}

function parseGeminiTextToReport(text: string): Report {
    const safe = (text || "").trim();

    // More tolerant section extraction:
    // Accept: ===SHIFT_SUMMARY===, ===SHIFT SUMMARY===, SHIFT_SUMMARY:, SHIFT SUMMARY:
    const getSection = (name: string) => {
        const variants = [
            `===${name}===`,
            `===${name.replaceAll("_", " ")}===`,
            `${name}:`,
            `${name.replaceAll("_", " ")}:`,
        ].map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

        const startRe = new RegExp(`(?:^|\\n)(?:${variants.join("|")})\\s*\\n`, "i");
        const start = safe.search(startRe);
        if (start === -1) return "";

        // Find the end: next marker-like header or end of string
        const afterStart = safe.slice(start).replace(startRe, "");
        const endRe = /\n(?:===\s*[A-Z _]+\s*===|[A-Z _]+:)\s*\n/i;
        const endIdx = afterStart.search(endRe);

        return (endIdx === -1 ? afterStart : afterStart.slice(0, endIdx)).trim();
    };

    const incidentBlock = getSection("INCIDENT_EXPLANATIONS");
    let summaryBlock = getSection("SHIFT_SUMMARY");
    const checklistBlock = getSection("ACTION_CHECKLIST");

    // If SHIFT_SUMMARY marker was missing, try to infer it between incident and checklist sections.
    if (!summaryBlock) {
        const incIdx = safe.search(/===\s*INCIDENT[_ ]EXPLANATIONS\s*===/i);
        const chkIdx = safe.search(/===\s*ACTION[_ ]CHECKLIST\s*===/i);
        if (incIdx !== -1 && chkIdx !== -1 && chkIdx > incIdx) {
            const between = safe.slice(incIdx, chkIdx);
            // remove the incident header and incident list itself as best-effort:
            // take everything AFTER the first blank line following incident section
            const afterIncidentHeader = between.replace(/^[\s\S]*?===\s*INCIDENT[_ ]EXPLANATIONS\s*===\s*\n/i, "");
            // If the model wrote incident bullets, summary often starts after a blank line
            const parts = afterIncidentHeader.split(/\n\s*\n/);
            // Heuristic: last paragraph chunk before checklist is likely the summary
            if (parts.length > 1) summaryBlock = parts.slice(1).join("\n\n").trim();
        }
    }

    const incidentExplanations = incidentBlock
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.replace(/^[-*•]\s+/, ""))
        .filter(Boolean);

    const shiftSummary = summaryBlock || "";

    const actionChecklist: Report["actionChecklist"] = [];
    if (checklistBlock) {
        const lines = checklistBlock.split("\n").map((l) => l.trim());
        let current: { incident: string; actions: string[] } | null = null;

        for (const line of lines) {
            if (!line) continue;

            const incidentMatch = line.match(/^Incident\s*:\s*(.+)$/i);
            if (incidentMatch) {
                if (current) actionChecklist.push(current);
                current = { incident: incidentMatch[1].trim(), actions: [] };
                continue;
            }

            const actionMatch = line.match(/^[-*•]\s+(.+)$/);
            if (actionMatch && current) current.actions.push(actionMatch[1].trim());
        }
        if (current) actionChecklist.push(current);
    }

    const candidate: Report = {
        incidentExplanations,
        shiftSummary,
        actionChecklist,
        raw: safe,
    };

    // Fallback: if model ignored formatting, keep something visible.
    if (!incidentExplanations.length && !shiftSummary && !actionChecklist.length) {
        return { incidentExplanations: safe ? [safe] : [], shiftSummary: "", actionChecklist: [], raw: safe };
    }

    return candidate;
}

// --- Lightweight Markdown renderer (safe subset; no raw HTML) ---
function escapeHtml(s: string) {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderInlineMd(text: string) {
    // Escape first, then apply safe formatting
    let s = escapeHtml(text);

    // Inline code
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold + italic
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");

    // Bold, italic
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // Links [text](url) — allow http(s) only
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, `<a href="$2" target="_blank" rel="noreferrer">$1</a>`);

    return s;
}

function markdownToSafeHtml(md: string) {
    const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
    const out: string[] = [];

    let inCode = false;
    let codeLang = "";
    let codeBuf: string[] = [];

    let inUl = false;
    const closeUlIfNeeded = () => {
        if (inUl) {
            out.push("</ul>");
            inUl = false;
        }
    };

    const flushCode = () => {
        if (!inCode) return;
        const code = escapeHtml(codeBuf.join("\n"));
        out.push(`<pre><code class="language-${escapeHtml(codeLang)}">${code}</code></pre>`);
        inCode = false;
        codeLang = "";
        codeBuf = [];
    };

    for (const rawLine of lines) {
        const line = rawLine ?? "";

        // ``` fences
        const fence = line.match(/^```(\w+)?\s*$/);
        if (fence) {
            if (inCode) {
                flushCode();
            } else {
                closeUlIfNeeded();
                inCode = true;
                codeLang = fence[1] || "";
                codeBuf = [];
            }
            continue;
        }

        if (inCode) {
            codeBuf.push(line);
            continue;
        }

        // Headings
        const h = line.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
            closeUlIfNeeded();
            const level = h[1].length;
            out.push(`<h${level}>${renderInlineMd(h[2].trim())}</h${level}>`);
            continue;
        }

        // List items
        const li = line.match(/^[-*]\s+(.*)$/);
        if (li) {
            if (!inUl) {
                out.push("<ul>");
                inUl = true;
            }
            out.push(`<li>${renderInlineMd(li[1].trim())}</li>`);
            continue;
        } else {
            closeUlIfNeeded();
        }

        // Empty line -> paragraph break
        if (!line.trim()) {
            out.push("");
            continue;
        }

        // Paragraph
        out.push(`<p>${renderInlineMd(line.trim())}</p>`);
    }

    flushCode();
    closeUlIfNeeded();

    // Join while preserving breaks (empty strings are fine)
    return out.filter((x) => x !== null && x !== undefined).join("\n");
}

function MarkdownBlock({ markdown, className }: { markdown: string; className?: string }) {
    const html = useMemo(() => markdownToSafeHtml(markdown), [markdown]);
    return (
        <div
            className={cn(
                "prose prose-sm dark:prose-invert max-w-none",
                // tighten spacing a bit for dashboard cards
                "prose-p:my-2 prose-ul:my-2 prose-li:my-1 prose-pre:my-2",
                className
            )}
            // safe subset renderer: escaped + no raw HTML passthrough from user
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

export default function SafetyReports() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [timeRange, setTimeRange] = useState<TimeRange>("current_shift");
    const [severityFocus, setSeverityFocus] = useState<SeverityFocus>("all");
    const [selectedZone, setSelectedZone] = useState<string>("All zones");
    const [error, setError] = useState<string | null>(null);
    const [report, setReport] = useState<Report | null>(null);

    const env = (import.meta as any).env ?? {};
    const apiKey =
        (env.VITE_GEMINI_API_KEY ||
            env.NEXT_PUBLIC_GEMINI_API_KEY ||
            env.NEXT_PUBLIC_RESUME_API_KEY ||
            env.GEMINI_API_KEY) as string | undefined;

    const modelFromEnv =
        (env.VITE_GEMINI_API_MODEL ||
            env.NEXT_PUBLIC_RESUME_API_MODEL ||
            env.NEXT_PUBLIC_GEMINI_MODEL) as string | undefined;

    const model = (modelFromEnv || DEFAULT_MODEL).trim();

    const apiKeyTrimmed = (apiKey || "").trim();
    const hasApiKey = apiKeyTrimmed.length > 0;

    // TODO: Replace these mock values with real app state / API queries.
    const zones = useMemo(() => ["All zones", "Zone A / Loading Bay", "Zone B / Warehouse", "Zone C / Machine Line 2"], []);
    const workers = useMemo(
        () => [
            { id: "W-011", name: "Operator A", role: "Operator", shift: "Day" },
            { id: "W-014", name: "Driver B", role: "Forklift", shift: "Day" },
            { id: "W-005", name: "Supervisor C", role: "Supervisor", shift: "Day" },
        ],
        []
    );

    const timeRangeLabel = useMemo(() => {
        switch (timeRange) {
            case "current_shift":
                return "Current shift";
            case "last_24h":
                return "Last 24 hours";
            case "last_7d":
                return "Last 7 days";
            default:
                return "Selected range";
        }
    }, [timeRange]);

    const mockIncidents = useMemo(
        () => [
            {
                id: "INC-1042",
                ts: "2025-12-31T09:12:00Z",
                zone: "Zone A / Loading Bay",
                risk: "High",
                summary: "Forklift near-miss with pedestrian; horn not used; visibility partially blocked.",
                signals: ["Proximity alert", "Visibility obstruction", "Traffic overlap"],
            },
            {
                id: "INC-1043",
                ts: "2025-12-31T11:05:00Z",
                zone: "Zone C / Machine Line 2",
                risk: "Medium",
                summary: "PPE non-compliance observed (no eye protection) during grinding task.",
                signals: ["PPE violation", "Task hazard: grinding"],
            },
            {
                id: "INC-1044",
                ts: "2025-12-31T12:20:00Z",
                zone: "Zone B / Warehouse",
                risk: "Low",
                summary: "Housekeeping: packaging debris near aisle; trip hazard potential.",
                signals: ["Trip hazard", "Housekeeping"],
            },
        ],
        []
    );

    const visibleIncidents = useMemo(() => {
        return mockIncidents
            .filter((i) => (selectedZone === "All zones" ? true : i.zone === selectedZone))
            .filter((i) => (severityFocus === "high_only" ? i.risk === "High" : true));
    }, [mockIncidents, selectedZone, severityFocus]);

    const kpi = useMemo(() => {
        const total = visibleIncidents.length;
        const high = visibleIncidents.filter((i) => i.risk === "High").length;
        const med = visibleIncidents.filter((i) => i.risk === "Medium").length;
        const low = visibleIncidents.filter((i) => i.risk === "Low").length;
        const uniqZones = new Set(visibleIncidents.map((i) => i.zone)).size;
        return { total, high, med, low, uniqZones };
    }, [visibleIncidents]);

    const generateReport = async () => {
        setError(null);
        setIsGenerating(true);
        setReport(null);

        try {
            if (!hasApiKey) {
                throw new Error(
                    "Missing API key in import.meta.env. For Vite, define VITE_GEMINI_API_KEY in the env file located at the Vite app root (usually /client) and restart the dev server."
                );
            }

            const systemContent = [
                "You are StreamSafe 4D Safety Analyst.",
                "Write crisp, high-signal reporting for an industrial environment.",
                "Avoid generic filler. Use concrete causes, risks, and mitigations.",
                "Return PLAIN TEXT with EXACT section markers (DO NOT omit any marker):",
                "===INCIDENT_EXPLANATIONS===",
                "===SHIFT_SUMMARY===",
                "===ACTION_CHECKLIST===",
                "",
                "Formatting rules:",
                "- You MAY use Markdown inside INCIDENT_EXPLANATIONS and SHIFT_SUMMARY.",
                "- INCIDENT_EXPLANATIONS: Markdown bullet list; 1 bullet per incident (include incident id).",
                "- SHIFT_SUMMARY: Markdown; 1–2 short paragraphs; optionally add a short bullet list of patterns.",
                "- ACTION_CHECKLIST: keep the strict plain-text structure:",
                "  Incident: <INC-ID> - <short title>",
                "  - <immediate corrective action>",
                "  - <preventive control>",
                "  - <verification step>",
                "If you have no data, still output the marker and write 'No incidents in scope.'",
            ].join("\n");

            const context = {
                reportWindow: timeRange,
                zoneScope: selectedZone,
                severityFocus,
                zones: zones.filter((z) => z !== "All zones"),
                workforceSnapshot: {
                    headcount: workers.length,
                    roster: workers,
                },
                incidents: visibleIncidents,
                environment: {
                    weather: "Rainy; higher slip risk near bay doors.",
                    constraints: ["Busy inbound/outbound traffic", "Mixed pedestrian/forklift routes"],
                },
                kpi,
            };

            const userContent = [
                `Generate the Safety Report for: ${timeRangeLabel}.`,
                "Use the provided context JSON (treat it as ground truth):",
                JSON.stringify(context, null, 2),
                "",
                "Deliverables:",
                "1) Incident explanations: what likely happened, key contributors, and why it matters (severity justification).",
                "2) Shift summary: overall risk posture, repeated patterns, and top 2 priorities for the next shift.",
                "3) Recommended action checklist per incident: immediate + preventive + verification steps.",
            ].join("\n");

            const url = GEMINI_ENDPOINT(model);

            // Combine system and user prompts into a single user message for Gemini
            const payload = {
                contents: [
                    {
                        parts: [{ text: `${systemContent}\n\n${userContent}` }],
                    },
                ],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 4096,
                    responseMimeType: "text/plain",
                },
            };

            const makeApiCall = async () => {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKeyTrimmed,
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => "");
                    let errorMessage = `Gemini API error ${response.status}: ${errText || response.statusText}`;
                    try {
                        const errorData = JSON.parse(errText);
                        errorMessage = `Gemini API error ${response.status}: ${JSON.stringify(errorData)}`;
                    } catch {
                        // keep message
                    }
                    throw new Error(errorMessage);
                }

                return response;
            };

            const maxAttempts = 3;
            let lastErr: unknown = null;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const response = await makeApiCall();
                    const json = await response.json();
                    const text = extractPlainTextFromGemini(json);
                    const parsed = parseGeminiTextToReport(text);
                    setReport(parsed);
                    lastErr = null;
                    break;
                } catch (e) {
                    lastErr = e;
                    if (attempt < maxAttempts) await sleep(600 * attempt);
                }
            }

            if (lastErr) throw lastErr;
        } catch (e: any) {
            setError(e?.message || "Failed to generate report.");
        } finally {
            setIsGenerating(false);
        }
    };

    const pill = "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium";

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold leading-tight">Safety Reports</h1>
                            <p className="text-muted-foreground">
                                Incident explanations, shift summary, and per-incident action checklists (Gemini).
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className={cn(pill, "text-muted-foreground")}>
                            <Clock className="h-3.5 w-3.5" />
                            {timeRangeLabel}
                        </span>
                        <span className={cn(pill, "text-muted-foreground")}>
                            <Wand2 className="h-3.5 w-3.5" />
                            {model}
                        </span>
                        <span
                            className={cn(
                                pill,
                                hasApiKey ? "border-emerald-500/40 text-emerald-600" : "border-red-500/40 text-red-600"
                            )}
                        >
                            <span className={cn("h-2 w-2 rounded-full", hasApiKey ? "bg-emerald-500" : "bg-red-500")} />
                            {hasApiKey ? "API key loaded" : "API key missing"}
                        </span>
                    </div>
                </div>

                <Card className="w-full lg:max-w-2xl">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Report controls</CardTitle>
                        <CardDescription>Scope the report and generate an exec-ready output.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <Button
                                type="button"
                                variant={timeRange === "current_shift" ? "default" : "outline"}
                                className="justify-start"
                                onClick={() => setTimeRange("current_shift")}
                                disabled={isGenerating}
                            >
                                Current shift
                            </Button>
                            <Button
                                type="button"
                                variant={timeRange === "last_24h" ? "default" : "outline"}
                                className="justify-start"
                                onClick={() => setTimeRange("last_24h")}
                                disabled={isGenerating}
                            >
                                Last 24h
                            </Button>
                            <Button
                                type="button"
                                variant={timeRange === "last_7d" ? "default" : "outline"}
                                className="justify-start"
                                onClick={() => setTimeRange("last_7d")}
                                disabled={isGenerating}
                            >
                                Last 7d
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <Button
                                type="button"
                                variant={severityFocus === "all" ? "default" : "outline"}
                                className="justify-start"
                                onClick={() => setSeverityFocus("all")}
                                disabled={isGenerating}
                            >
                                All severities
                            </Button>
                            <Button
                                type="button"
                                variant={severityFocus === "high_only" ? "default" : "outline"}
                                className="justify-start"
                                onClick={() => setSeverityFocus("high_only")}
                                disabled={isGenerating}
                            >
                                High only
                            </Button>

                            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <select
                                    className="w-full bg-transparent outline-none"
                                    value={selectedZone}
                                    onChange={(e) => setSelectedZone(e.target.value)}
                                    disabled={isGenerating}
                                >
                                    {zones.map((z) => (
                                        <option key={z} value={z}>
                                            {z}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <Button onClick={generateReport} disabled={isGenerating || !apiKey} className="w-full sm:w-auto">
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Generating…
                                    </>
                                ) : (
                                    <>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Generate report
                                    </>
                                )}
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={() => {
                                    setReport(null);
                                    setError(null);
                                }}
                                disabled={isGenerating}
                            >
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Reset
                            </Button>
                        </div>

                        {!apiKey && (
                            <p className="text-xs text-muted-foreground">
                                Set <span className="font-mono">VITE_GEMINI_API_KEY</span> in your env and restart the dev server.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Context / KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Incidents in scope</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-end justify-between">
                        <div className="text-3xl font-semibold">{kpi.total}</div>
                        <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">High / Medium / Low</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                        <div className="text-sm font-medium">
                            <span className="text-red-500">{kpi.high}</span> /{" "}
                            <span className="text-yellow-500">{kpi.med}</span> /{" "}
                            <span className="text-emerald-500">{kpi.low}</span>
                        </div>
                        <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Zones affected</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-end justify-between">
                        <div className="text-3xl font-semibold">{kpi.uniqZones}</div>
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Workforce (snapshot)</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-end justify-between">
                        <div className="text-3xl font-semibold">{workers.length}</div>
                        <Users className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
            </div>

            {error && (
                <Card className="border-red-500/40">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base text-red-600">Generation failed</CardTitle>
                        <CardDescription className="text-red-600/80">{error}</CardDescription>
                    </CardHeader>
                </Card>
            )}

            {isGenerating && (
                <div className="grid gap-6 lg:grid-cols-12">
                    <Card className="lg:col-span-6">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                                Incident explanations
                            </CardTitle>
                            <CardDescription>Analyzing incidents and likely contributors…</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-10/12 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-9/12 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-10/12 animate-pulse rounded bg-muted" />
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-6">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Clock className="h-5 w-5 text-blue-500" />
                                Shift summary
                            </CardTitle>
                            <CardDescription>Summarizing safety posture and trends…</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-10/12 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-9/12 animate-pulse rounded bg-muted" />
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-12">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <CheckSquare className="h-5 w-5 text-emerald-500" />
                                Action checklist
                            </CardTitle>
                            <CardDescription>Drafting immediate + preventive controls…</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                                <div className="h-4 w-7/12 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-10/12 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-9/12 animate-pulse rounded bg-muted" />
                            </div>
                            <div className="space-y-2">
                                <div className="h-4 w-7/12 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-10/12 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-9/12 animate-pulse rounded bg-muted" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {report && !isGenerating && (
                <div className="grid gap-6 lg:grid-cols-12">
                    <Card className="lg:col-span-6">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                                Incident explanations
                            </CardTitle>
                            <CardDescription>
                                Clear, per-incident reasoning: what likely happened, key contributors, and why it matters.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {report.incidentExplanations?.length ? (
                                <div className="rounded-lg border bg-card p-3 shadow-sm">
                                    <MarkdownBlock
                                        markdown={report.incidentExplanations.map((x) => `- ${x}`).join("\n")}
                                    />
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No incident explanations returned.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-6">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Clock className="h-5 w-5 text-blue-500" />
                                Shift summary
                            </CardTitle>
                            <CardDescription>
                                A concise narrative of the overall safety posture, patterns, and next-shift priorities.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {report.shiftSummary ? (
                                <div className="rounded-lg border bg-card p-3 shadow-sm">
                                    <MarkdownBlock markdown={report.shiftSummary} />
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No shift summary returned.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-12">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <CheckSquare className="h-5 w-5 text-emerald-500" />
                                Recommended action checklist
                            </CardTitle>
                            <CardDescription>Immediate corrections + preventive controls + verification.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {report.actionChecklist?.length ? (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {report.actionChecklist.map((item, i) => (
                                        <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
                                            <p className="text-sm font-semibold">{item.incident}</p>
                                            <div className="mt-3 space-y-2">
                                                {(item.actions || []).map((action, j) => (
                                                    <div key={j} className="flex items-start gap-2 rounded-md bg-muted/30 p-2">
                                                        <CheckSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                                                        <span className="text-sm leading-relaxed">{action}</span>
                                                    </div>
                                                ))}
                                                {!item.actions?.length && (
                                                    <p className="text-sm text-muted-foreground">No actions listed for this incident.</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No action checklist returned.</p>
                            )}

                            {report.raw && (
                                <details className="mt-6 rounded-lg border bg-card p-3">
                                    <summary className="cursor-pointer text-sm text-muted-foreground">View raw model output</summary>
                                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed">{report.raw}</pre>
                                </details>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {!report && !isGenerating && !error && (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground text-sm max-w-2xl">
                            Generate a report to get incident explanations, a shift-level narrative, and an actionable checklist. Use the
                            controls above to scope the analysis.
                        </p>
                    </CardContent>
                </Card>
            )}

            {!hasApiKey && (
                <Card className="border-dashed">
                    <CardContent className="py-4 text-sm text-muted-foreground space-y-2">
                        <div className="font-medium text-foreground">Env diagnostics (browser)</div>
                        <div className="font-mono text-xs whitespace-pre-wrap break-words">
                            {JSON.stringify(
                                {
                                    presentKeys: Object.keys(env).filter((k) =>
                                        ["VITE_GEMINI_API_KEY", "VITE_GEMINI_API_MODEL", "NEXT_PUBLIC_GEMINI_API_KEY", "NEXT_PUBLIC_RESUME_API_MODEL"].includes(
                                            k
                                        )
                                    ),
                                    hint:
                                        "If this is empty, your .env is not being loaded by the Vite dev server. Move/copy the env vars to: StreamSafe-frontend/client/.env (or .env.local) and restart.",
                                },
                                null,
                                2
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
