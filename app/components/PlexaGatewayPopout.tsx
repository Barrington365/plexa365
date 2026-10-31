"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgentArtwork } from "@/app/admin/agents/AgentArtwork";
import { ApproveAgentTask } from "@/app/admin/agents/ApproveAgentTask";
import { roles, type Command } from "@/app/lib/agents/model";
import { createPortal } from "react-dom";
import { AiProviderGatewayPanel } from "@/app/components/AiProviderGatewayPanel";
import { R365Button } from "@/app/components/R365Button";
import { studioApiPath } from "@/app/lib/app-base-path";
import type { ReleaseCheckResult } from "@/app/lib/dev-gateway/release-check";

type Props = {
  triggerLabel?: string;
  triggerClassName?: string;
  floating?: boolean;
  defaultOpen?: boolean;
  embedded?: boolean;
  initialAgentId?: string;
};

type Position = { x: number; y: number };
type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type ApiResponse = {
  result?: ReleaseCheckResult;
  model?: string;
  error?: string;
};

type GatewayMode = "release_check" | "ask_openai" | "ask_cursor" | "build_cursor_task" | "review_cursor_plan" | "review_code" | "save_learning";
type GatewayRunMode = "instant" | "thinking";
type GatewayChatResponse = {
  proposal?: {command:Command;version:number};
  summary: string;
  recommendation: string;
  steps: string[];
  risks: string[];
  filesLikelyAffected: string[];
  cursorPrompt: string;
  testPlan: string[];
  saveableLearning: {
    type: "knowledge" | "prompt_rule" | "creator_profile" | "dev_note" | "none";
    title: string;
    content: string;
    confidence: number;
  };
};
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  response?: GatewayChatResponse;
  model?: string;
  mode?: GatewayMode;
};
type SharedContextItem = {
  id: string;
  from: "openai" | "cursor";
  to: "openai" | "cursor";
  title: string;
  content: string;
};
type UploadedContextFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  dataUrl?: string;
};

const MODES: Array<{ id: GatewayMode; label: string }> = [
  { id: "release_check", label: "Release Check / QA Review" },
  { id: "ask_openai", label: "Ask OpenAI" },
  { id: "ask_cursor", label: "Ask Cursor" },
  { id: "build_cursor_task", label: "Build Cursor Task" },
  { id: "review_cursor_plan", label: "Review Cursor Plan" },
  { id: "review_code", label: "Review Code / Diff" },
  { id: "save_learning", label: "Save Learning" },
];

const RUN_MODE_LABELS: Record<GatewayRunMode, string> = {
  instant: "Instant",
  thinking: "Thinking · Extended",
};

const CONTEXT_OPTIONS = [
  ["article_studio", "Article Studio"],
  ["knowledge_base", "Knowledge Base"],
  ["language_studio", "Language Studio"],
  ["creator_profiles", "Creator Profiles"],
  ["prompt_rules", "Prompt Rules"],
  ["quality_checks", "Quality Checks"],
  ["loop_feed", "Loop Feed"],
  ["priority_reporters", "Priority Reporters"],
  ["match_report_builder", "Match Report Builder"],
  ["brand_guides", "Brand Guides"],
  ["recent_dev_notes", "Recent Dev Notes"],
  ["current_page_context", "Current Page Context"],
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function initialPosition(): Position {
  if (typeof window === "undefined") return { x: 8, y: 8 };
  if (window.innerWidth < 768) return { x: 8, y: 8 };
  const width = Math.min(720, window.innerWidth - 24);
  const height = Math.min(760, window.innerHeight - 32);
  return {
    x: Math.max(12, window.innerWidth - width - 24),
    y: Math.max(12, window.innerHeight - height - 24),
  };
}

function checklist(result: ReleaseCheckResult): string {
  return [
    `Decision: ${result.decision}`,
    `Risk: ${result.riskLevel}`,
    "",
    "Changed areas:",
    ...result.changedAreas.map((item) => `- ${item}`),
    "",
    "Risks:",
    ...result.risks.map((item) => `- ${item}`),
    "",
    "Smoke tests:",
    ...result.smokeTests.map((item) => `- ${item}`),
    "",
    "Rollback:",
    ...result.rollbackPlan.rollbackSteps.map((item) => `- ${item}`),
  ].join("\n");
}

function temporaryUploadedFilesBlock(files: UploadedContextFile[]): string {
  if (!files.length) return "";
  return [
    "",
    "Temporary uploaded files for this Gateway chat only. These files are not saved to Library or Knowledge Base unless the admin explicitly chooses a save action:",
    ...files.map((file) =>
      [
        `--- ${file.name} (${file.type || "unknown"}, ${file.size} bytes) ---`,
        file.content || "[No readable text extracted.]",
      ].join("\n"),
    ),
  ].join("\n\n");
}

function isTextLikeFile(file: File): boolean {
  return file.type.startsWith("text/") || /\.(txt|md|csv|json|xml|html|css|js|jsx|ts|tsx|sql|log)$/i.test(file.name);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function PlexaGatewayPopout({
  triggerLabel = "Plexa Agent",
  triggerClassName,
  floating = false,
  defaultOpen = false,
  embedded = false,
  initialAgentId = "manager",
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [allowed, setAllowed] = useState(!floating || embedded);
  const [open, setOpen] = useState(defaultOpen);
  const [position, setPosition] = useState<Position | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [agentId,setAgentId] = useState(initialAgentId);
  const [mode, setMode] = useState<GatewayMode>("ask_openai");
  const [runMode, setRunMode] = useState<GatewayRunMode>("instant");
  const [contextKeys, setContextKeys] = useState<string[]>([]);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showProjectsMenu, setShowProjectsMenu] = useState(false);
  const [showRdMenu, setShowRdMenu] = useState(false);
  const [showAiProviderPanel, setShowAiProviderPanel] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ReleaseCheckResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sharedContext, setSharedContext] = useState<SharedContextItem[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedContextFile[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qaChecklist = useMemo(() => (result ? checklist(result) : ""), [result]);
  const currentModeLabel = mode === "ask_openai" ? RUN_MODE_LABELS[runMode] : MODES.find((item) => item.id === mode)?.label ?? "Gateway";

  useEffect(() => {
    if (!floating) return;
    void fetch(studioApiPath("/api/auth/me"), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAllowed(data?.user?.role === "admin"))
      .catch(() => setAllowed(false));
  }, [floating]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, result, status, error]);

  const openPopout = () => {
    setPosition(initialPosition());
    setOpen(true);
  };

  const openBrowserPopout = () => {
    const width = 940;
    const height = 820;
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));
    const child = window.open(
      studioApiPath(`/dev-gateway/popout?agent=${encodeURIComponent(agentId)}`),
      "plexa-dev-gateway",
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );
    if (!child) setStatus("Popout was blocked by the browser. Allow popups for Plexa and try again.");
    else child.focus();
  };

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    setPosition({ x: rect.left, y: rect.top });
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? 720;
    const height = panel?.offsetHeight ?? 720;
    setPosition({
      x: clamp(dragState.originX + event.clientX - dragState.startX, 8, Math.max(8, window.innerWidth - width - 8)),
      y: clamp(dragState.originY + event.clientY - dragState.startY, 8, Math.max(8, window.innerHeight - height - 8)),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState?.pointerId === event.pointerId) {
      setDragState(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const runCheck = async () => {
    const fileBlock = uploadedFiles.length ? temporaryUploadedFilesBlock(uploadedFiles) : "";
    setBusy(true);
    setError(null);
    setStatus(null);
    abortRef.current = new AbortController();
    try {
      const res = await fetch(studioApiPath("/api/dev-gateway/release-check"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: `${input.trim()}${fileBlock}`.trim() }),
        credentials: "include",
        signal: abortRef.current.signal,
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || !data.result) throw new Error(data.error || "Release check failed");
      setResult(data.result);
      setModel(data.model ?? null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setStatus("OpenAI request stopped.");
      else setError(e instanceof Error ? e.message : "Release check failed");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const sendChat = async () => {
    const userPrompt = input.trim();
    if (!userPrompt && !uploadedFiles.length) return;
    const activeMode = mode;
    const recentConversation = messages.slice(-8).map((message) => `${message.role === "user" ? "Admin" : "Assistant"}: ${message.content}`).join("\n\n");
    const sharedBlock = sharedContext.length
      ? [
          "",
          "Shared OpenAI/Cursor context selected by admin:",
          ...sharedContext.map((item) => `[${item.from} -> ${item.to}] ${item.title}\n${item.content}`),
        ].join("\n\n")
      : "";
    setBusy(true);
    setError(null);
    setStatus(null);
    const fileBlock = uploadedFiles.length ? temporaryUploadedFilesBlock(uploadedFiles) : "";
    const visiblePrompt = [
      userPrompt,
      uploadedFiles.length ? `Attached ${uploadedFiles.length} temporary file${uploadedFiles.length === 1 ? "" : "s"} for this chat.` : "",
    ].filter(Boolean).join("\n\n");
    const conversationBlock = recentConversation
      ? `\n\nRecent conversation so you can reply naturally:\n${recentConversation}\n\nLatest admin message:\n`
      : "";
    const runModeBlock = activeMode === "ask_openai" && runMode === "thinking"
      ? "\n\nGateway mode: Thinking · Extended. Take extra care, reason through trade-offs, and give a more considered answer."
      : "";
    setMessages((current) => [...current, { role: "user", content: visiblePrompt, mode: activeMode }]);
    setInput("");
    setShowModeMenu(false);
    setShowContextMenu(false);
    abortRef.current = new AbortController();
    try {
      const res = await fetch(studioApiPath(activeMode === "ask_openai" && !uploadedFiles.length ? "/api/admin/agents/chat" : "/api/dev-gateway/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: abortRef.current.signal,
        body: JSON.stringify({
          mode: activeMode,
          agentId,
          userPrompt: `${conversationBlock}${userPrompt}${runModeBlock}${fileBlock}${sharedBlock}`,
          contextKeys,
          currentPage: typeof window !== "undefined" ? window.location.pathname : "",
          uploadedFiles: uploadedFiles.map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            content: file.content,
            dataUrl: file.dataUrl,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        response?: GatewayChatResponse;
        model?: string;
        error?: string;
      };
      if (!res.ok || !data.response) throw new Error(data.error || "Dev Gateway chat failed");
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.response?.summary ?? "", response: data.response, model: data.model, mode: activeMode },
      ]);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setStatus("OpenAI request stopped.");
      else {
        setInput(userPrompt);
        setError(e instanceof Error ? e.message : "Dev Gateway chat failed");
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  const transcribeAudio = async (blob: Blob) => {
    setBusy(true);
    setError(null);
    setStatus("Transcribing audio...");
    try {
      const form = new FormData();
      form.set("audio", new File([blob], "gateway-audio.webm", { type: blob.type || "audio/webm" }));
      const res = await fetch(studioApiPath("/api/dev-gateway/transcribe"), {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Audio transcription failed");
      setInput((current) => [current.trim(), data.text?.trim()].filter(Boolean).join("\n"));
      setStatus("Audio transcribed. You can edit before sending.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio transcription failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void transcribeAudio(blob);
      };
      recorder.start();
      setRecording(true);
      setStatus("Recording... click mic again to stop.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start microphone.");
    }
  };

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setStatus(`${label} copied.`);
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setStatus("Reading files for temporary chat context...");
    try {
      const next: UploadedContextFile[] = [];
      for (const file of Array.from(files).slice(0, 5)) {
        if (file.type.startsWith("image/") && file.size <= 4_000_000) {
          next.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            type: file.type || "image",
            size: file.size,
            content: "[Image uploaded as temporary visual context.]",
            dataUrl: await readAsDataUrl(file),
          });
          continue;
        }
        if (file.size > 2_000_000) {
          next.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            type: file.type || "unknown",
            size: file.size,
            content: "[File omitted: over the 2MB temporary context limit.]",
          });
          continue;
        }
        const text = isTextLikeFile(file)
          ? await file.text()
          : `[${file.type || "Binary"} file uploaded as temporary context. Text extraction is not available for this file type yet.]`;
        next.push({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          type: file.type || "text/plain",
          size: file.size,
          content: text.slice(0, 12000),
        });
      }
      setUploadedFiles((current) => [...next, ...current].slice(0, 8));
      setStatus("Files added as temporary chat context. They have not been saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read uploaded files.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveUploadedContext = async (saveAs: "dev_note" | "knowledge" | "prompt_rule" | "creator_profile") => {
    if (!uploadedFiles.length) return;
    setStatus(null);
    setError(null);
    try {
      const content = temporaryUploadedFilesBlock(uploadedFiles).trim();
      const res = await fetch(studioApiPath("/api/dev-gateway/save-learning"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          saveAs,
          mode,
          title: `Uploaded Gateway context (${uploadedFiles.map((file) => file.name).join(", ").slice(0, 80)})`,
          content,
          linkedFiles: uploadedFiles.map((file) => file.name),
          confidence: 75,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      setStatus(saveAs === "dev_note" ? "Uploaded context saved as dev note draft." : "Uploaded context sent to approval queue.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const saveLearning = async (response: GatewayChatResponse, saveAs: "dev_note" | "knowledge" | "prompt_rule" | "creator_profile") => {
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(studioApiPath("/api/dev-gateway/save-learning"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          saveAs,
          mode,
          title: response.saveableLearning.title || response.summary.slice(0, 80) || "Dev Gateway learning",
          content: response.saveableLearning.content || response.recommendation || response.summary,
          linkedFiles: response.filesLikelyAffected,
          confidence: response.saveableLearning.confidence,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      setStatus(saveAs === "dev_note" ? "Saved as dev note draft." : "Saved to approval queue.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const shareResponse = (response: GatewayChatResponse, direction: "to_cursor" | "to_openai") => {
    const to: SharedContextItem["to"] = direction === "to_cursor" ? "cursor" : "openai";
    const from: SharedContextItem["from"] = direction === "to_cursor" ? "openai" : "cursor";
    const title = direction === "to_cursor" ? "OpenAI response for Cursor" : "Cursor task/context for OpenAI";
    const content = [
      response.summary,
      response.recommendation ? `Recommendation: ${response.recommendation}` : "",
      response.cursorPrompt ? `Cursor prompt:\n${response.cursorPrompt}` : "",
      response.risks.length ? `Risks:\n${response.risks.map((risk) => `- ${risk}`).join("\n")}` : "",
      response.testPlan.length ? `Test plan:\n${response.testPlan.map((test) => `- ${test}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
    setSharedContext((current) => [
      { id: `shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, from, to, title, content },
      ...current,
    ].slice(0, 8));
    setStatus(direction === "to_cursor" ? "Shared with Cursor context queue." : "Shared with OpenAI context queue.");
  };

  const buildRdEvidenceContent = () => {
    const conversation = messages.map((message) => `${message.role === "user" ? "Admin" : "OpenAI"}:\n${message.content}`).join("\n\n");
    const fileSummary = uploadedFiles.length
      ? `Uploaded temporary files:\n${uploadedFiles.map((file) => `- ${file.name} (${file.type || "unknown"}, ${file.size} bytes)`).join("\n")}`
      : "";
    return [
      `Mode: ${mode}`,
      `Captured: ${new Date().toISOString()}`,
      input.trim() ? `Current draft/input:\n${input.trim()}` : "",
      conversation ? `Conversation:\n${conversation}` : "",
      fileSummary,
    ].filter(Boolean).join("\n\n");
  };

  const saveRdEvidence = async () => {
    const content = buildRdEvidenceContent();
    if (!content.trim()) {
      setStatus("Add a message, output or file before saving R&D evidence.");
      return;
    }
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(studioApiPath("/api/dev-gateway/rd-evidence"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: `Gateway R&D evidence · ${new Date().toLocaleString()}`,
          content,
          mode,
          linkedFiles: uploadedFiles.map((file) => file.name),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "R&D save failed");
      setShowRdMenu(false);
      setStatus("Saved to R&D evidence.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "R&D save failed");
    }
  };

  const openRdPdf = () => {
    const content = buildRdEvidenceContent();
    if (!content.trim()) {
      setStatus("Add a message, output or file before creating a PDF.");
      return;
    }
    const win = window.open("", "plexa-rd-evidence-pdf", "width=900,height=900,scrollbars=yes,resizable=yes");
    if (!win) {
      setStatus("PDF popout was blocked. Allow popups and try again.");
      return;
    }
    win.document.write(`<!doctype html>
      <html>
        <head>
          <title>Plexa Agent R&D Evidence</title>
          <style>
            body{font-family:Arial,sans-serif;margin:40px;color:#111;line-height:1.5}
            h1{font-size:24px;margin:0 0 8px}
            p{color:#555;margin:0 0 24px}
            pre{white-space:pre-wrap;word-break:break-word;border:1px solid #ddd;border-radius:12px;padding:20px;background:#f8fafc}
            button{margin-bottom:20px;border:0;border-radius:999px;background:#111;color:#fff;padding:10px 16px;font-weight:700}
            @media print{button{display:none}body{margin:20mm}}
          </style>
        </head>
        <body>
          <button onclick="window.print()">Save as PDF</button>
          <h1>Plexa Agent R&D Evidence</h1>
          <p>Captured from Plexa Agent. Use browser print to save as PDF.</p>
          <pre>${escapeHtml(content)}</pre>
        </body>
      </html>`);
    win.document.close();
    win.focus();
    setShowRdMenu(false);
  };

  const chooseTool = (tool: "create_image" | "deep_research" | "web_search" | "agent_mode" | "create_task" | "add_sources" | "recent_files" | "openai_platform") => {
    setShowContextMenu(false);
    setShowProjectsMenu(false);
    if (tool === "create_image") {
      setMode("ask_openai");
      setRunMode("instant");
      setInput((current) => current || "Create an image prompt for: ");
      setStatus("Image creation mode selected. Describe the image you want Plexa to plan.");
      return;
    }
    if (tool === "deep_research") {
      setMode("ask_openai");
      setRunMode("thinking");
      setInput((current) => current || "Research this deeply and give me a careful answer: ");
      setStatus("Deep research prompt selected. Add sources or files for stronger context.");
      return;
    }
    if (tool === "web_search") {
      setMode("ask_openai");
      setRunMode("instant");
      setInput((current) => current || "Search/verify this using approved web sources where available: ");
      setStatus("Web search prompt selected. Live web search can be expanded in the backend next.");
      return;
    }
    if (tool === "agent_mode") {
      setMode("ask_cursor");
      setStatus("Agent mode selected. I will prepare Cursor-ready instructions.");
      return;
    }
    if (tool === "create_task") {
      setMode("build_cursor_task");
      setInput((current) => current || "Create a Cursor task for: ");
      return;
    }
    if (tool === "add_sources") {
      setContextKeys((current) => Array.from(new Set([...current, "knowledge_base", "brand_guides", "recent_dev_notes"])));
      setStatus("Core Plexa sources added to this chat context.");
      return;
    }
    if (tool === "recent_files") {
      setStatus("Recent files are not stored automatically here yet. Use Add photos & files for temporary context.");
      return;
    }
    window.open("https://platform.openai.com/", "_blank", "noopener,noreferrer");
  };

  const popout = open ? (
    <div
      ref={panelRef}
      className={
        embedded
          ? "relative flex h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-3xl border shadow-2xl backdrop-blur"
          : "fixed z-[1000] flex h-[min(760px,calc(100dvh-1rem))] w-[calc(100vw-1rem)] max-w-[720px] flex-col overflow-hidden rounded-3xl border shadow-2xl backdrop-blur"
      }
      style={{
        borderColor: "rgba(16,185,129,0.35)",
        background: "color-mix(in srgb, var(--surface) 96%, transparent)",
        ...(embedded ? {} : { left: `${position?.x ?? 8}px`, top: `${position?.y ?? 8}px` }),
      }}
      role="dialog"
      aria-modal="false"
      aria-label="Plexa Agent"
    >
      <div
        className={`flex touch-none select-none items-center justify-between gap-3 border-b px-4 py-3 ${embedded ? "" : "cursor-move"}`}
        style={{
          borderColor: "var(--border)",
          background: "linear-gradient(135deg, rgba(5,46,22,0.94), rgba(2,6,23,0.94))",
        }}
        onPointerDown={embedded ? undefined : beginDrag}
        onPointerMove={embedded ? undefined : moveDrag}
        onPointerUp={embedded ? undefined : endDrag}
        onPointerCancel={embedded ? undefined : endDrag}
      >
        <div>
          <p className="text-sm font-black text-[color:var(--text-primary)]">Plexa Agent</p>
          <p className="text-xs text-emerald-200">Mode: {currentModeLabel} · OpenAI · Admin-approved task proposals</p>
        </div>
        <div className="flex items-center gap-2">
          {!embedded ? (
            <button
              type="button"
              onClick={openBrowserPopout}
              onPointerDown={(event) => event.stopPropagation()}
              className="rounded-full border px-3 py-1 text-xs font-bold text-[color:var(--text-secondary)]"
              style={{ borderColor: "rgba(255,255,255,0.18)" }}
            >
              Pop out
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            onPointerDown={(event) => event.stopPropagation()}
            className="grid size-8 place-items-center rounded-full border text-sm font-black text-[color:var(--text-secondary)]"
            style={{ borderColor: "rgba(255,255,255,0.18)" }}
            aria-label="Close Plexa Agent"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <label className="block text-sm">Agent<select aria-label="Agent" value={agentId} disabled={busy} onChange={e=>{setAgentId(e.target.value);setMessages([]);setSharedContext([]);}} className="ml-3 rounded border bg-[color:var(--surface)] p-2"><option value="manager">Agent Manager</option>{roles.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        {agentId!=="manager"&&<AgentArtwork id={agentId} name={roles.find(r=>r[0]===agentId)?.[1]??agentId}/>}

        {!messages.length && !result ? (
          <div className="rounded-3xl border bg-[color:var(--surface)] p-6 text-center" style={{ borderColor: "var(--border)" }}>
            <p className="text-xl font-black text-[color:var(--text-primary)]">How can your Agent help?</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
              Send an instruction, inspect selected Studio context or propose a task for approval. Server execution is not connected. File attachments use the existing review chat.
            </p>
          </div>
        ) : null}
        {messages.length ? (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`max-w-[88%] rounded-2xl p-3 text-sm shadow-sm ${
                  message.role === "user"
                    ? "ml-auto bg-emerald-500 text-slate-950"
                    : "mr-auto border bg-[color:var(--surface)] text-[color:var(--text-secondary)]"
                }`}
                style={message.role === "assistant" ? { borderColor: "var(--border)" } : undefined}
              >
                <p className={message.role === "user" ? "font-bold text-slate-950" : "font-bold text-[color:var(--text-primary)]"}>
                  {message.role === "user" ? "You" : `OpenAI${message.model ? ` · ${message.model}` : ""}`}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
                {message.response ? (
                  <div className="mt-3 space-y-3">
                    {message.response.proposal && <ApproveAgentTask proposal={message.response.proposal}/>}
                    {message.response.recommendation ? <p><strong>Recommendation:</strong> {message.response.recommendation}</p> : null}
                    {message.response.risks.length ? <p><strong>Risks:</strong> {message.response.risks.join("; ")}</p> : null}
                    {message.response.testPlan.length ? <p><strong>Test plan:</strong> {message.response.testPlan.join("; ")}</p> : null}
                    {message.mode !== "ask_openai" || message.response.cursorPrompt || message.response.saveableLearning.type !== "none" ? (
                    <div className="flex flex-wrap gap-2">
                      <R365Button variant="ghost" onClick={() => void copy(JSON.stringify(message.response, null, 2), "Response")}>Copy</R365Button>
                      {message.response.cursorPrompt ? (
                        <R365Button variant="ghost" onClick={() => void copy(message.response?.cursorPrompt ?? "", "Cursor prompt")}>Copy Cursor Prompt</R365Button>
                      ) : null}
                      <R365Button variant="ghost" onClick={() => shareResponse(message.response!, "to_cursor")}>Share to Cursor</R365Button>
                      <R365Button variant="ghost" onClick={() => shareResponse(message.response!, "to_openai")}>Share to OpenAI</R365Button>
                      {message.response.saveableLearning.type !== "none" || message.mode === "save_learning" ? (
                        <>
                          <R365Button variant="ghost" onClick={() => void saveLearning(message.response!, "dev_note")}>Save as Dev Note</R365Button>
                          <R365Button variant="ghost" onClick={() => void saveLearning(message.response!, "knowledge")}>Save as Knowledge Proposal</R365Button>
                          <R365Button variant="ghost" onClick={() => void saveLearning(message.response!, "prompt_rule")}>Save as Prompt Rule Proposal</R365Button>
                          <R365Button variant="ghost" onClick={() => void saveLearning(message.response!, "creator_profile")}>Save as Creator Profile Proposal</R365Button>
                        </>
                      ) : null}
                    </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : null}
        {sharedContext.length ? (
          <div className="rounded-2xl border bg-[color:var(--surface)] p-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-wide text-[color:var(--text-muted)]">Shared OpenAI / Cursor Context</p>
              <button
                type="button"
                onClick={() => setSharedContext([])}
                className="text-xs font-bold text-[color:var(--text-secondary)] underline"
              >
                Clear
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {sharedContext.map((item) => (
                <div key={item.id} className="rounded-xl bg-[color:var(--surface-muted)] p-2 text-xs text-[color:var(--text-secondary)]">
                  <p className="font-bold text-[color:var(--text-primary)]">{item.from} → {item.to}: {item.title}</p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{item.content}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {uploadedFiles.length ? (
          <div className="rounded-2xl border bg-[color:var(--surface)] p-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-wide text-[color:var(--text-muted)]">Temporary Uploaded Files</p>
              <button
                type="button"
                onClick={() => setUploadedFiles([])}
                className="text-xs font-bold text-[color:var(--text-secondary)] underline"
              >
                Clear
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {uploadedFiles.map((file) => (
                <span key={file.id} className="rounded-full border px-3 py-1 text-xs font-semibold text-[color:var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>
                  {file.name}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
              These files are only shared with this Gateway chat unless you explicitly save them.
            </p>
          </div>
        ) : null}
        <div className="sticky bottom-0 z-10 rounded-3xl border bg-slate-900/80 p-3 shadow-lg" style={{ borderColor: "var(--border)" }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border px-3 py-1.5 text-xs font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              style={{ borderColor: "var(--border)" }}
            >
              Add photos & files
            </button>
            <button
              type="button"
              onClick={() => chooseTool("web_search")}
              className="rounded-full border px-3 py-1.5 text-xs font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              style={{ borderColor: "var(--border)" }}
            >
              Web search
            </button>
            <button
              type="button"
              onClick={() => chooseTool("deep_research")}
              className="rounded-full border px-3 py-1.5 text-xs font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              style={{ borderColor: "var(--border)" }}
            >
              Deep research
            </button>
            <button
              type="button"
              onClick={() => chooseTool("create_image")}
              className="rounded-full border px-3 py-1.5 text-xs font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              style={{ borderColor: "var(--border)" }}
            >
              Create image
            </button>
            <button
              type="button"
              onClick={() => chooseTool("agent_mode")}
              className="rounded-full border px-3 py-1.5 text-xs font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              style={{ borderColor: "var(--border)" }}
            >
              Agent mode
            </button>
            <button
              type="button"
              onClick={() => chooseTool("create_task")}
              className="rounded-full border px-3 py-1.5 text-xs font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              style={{ borderColor: "var(--border)" }}
            >
              Create task
            </button>
          </div>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void (mode === "release_check" ? runCheck() : sendChat());
              }
            }}
            rows={3}
            placeholder={mode === "release_check" ? "Paste release summary, git diff, changed files, Cursor plan, deployment notes..." : "Ask anything..."}
            className="max-h-48 min-h-[72px] w-full resize-none rounded-2xl bg-slate-800/70 p-3 text-sm leading-6 outline-none placeholder:text-slate-400"
            style={{ color: "var(--text-primary)" }}
          />
          <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={() => setShowContextMenu((value) => !value)}
              className="grid size-9 place-items-center rounded-full border text-xl font-light text-[color:var(--text-secondary)]"
              style={{ borderColor: "var(--border)" }}
              title="Context"
            >
              +
            </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.txt,.md,.csv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.sql,.log,.pdf,.doc,.docx"
                multiple
                className="hidden"
                onChange={(event) => void handleFileUpload(event.target.files)}
              />
            <button
              type="button"
              onClick={() => setShowModeMenu((value) => !value)}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold text-[color:var(--text-secondary)]"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="size-2 rounded-full bg-emerald-400" />
              {currentModeLabel}
              <span className="text-xs text-[color:var(--text-muted)]">⌄</span>
            </button>
            <span className="text-xs text-[color:var(--text-muted)]">
              {[contextKeys.length ? `${contextKeys.length} context` : "", uploadedFiles.length ? `${uploadedFiles.length} file${uploadedFiles.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "No context selected"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="grid size-10 place-items-center rounded-full text-[color:var(--text-secondary)] hover:bg-slate-800"
                title="Add photos & files"
                aria-label="Add photos and files"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                  <path d="m21.44 11.05-8.49 8.49a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => chooseTool("create_image")}
                className="grid size-10 place-items-center rounded-full text-[color:var(--text-secondary)] hover:bg-slate-800"
                title="Create image"
                aria-label="Create image"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="14" rx="3" />
                  <circle cx="8.5" cy="10.5" r="1.5" />
                  <path d="m21 15-4.5-4.5L9 18" />
                  <path d="m14 15 2 2" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => chooseTool("deep_research")}
                className="grid size-10 place-items-center rounded-full text-[color:var(--text-secondary)] hover:bg-slate-800"
                title="Deep research"
                aria-label="Deep research"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                  <path d="M4 18 14 8" />
                  <path d="m13 7 4 4" />
                  <path d="m3 21 4-1 12-12a2.8 2.8 0 0 0-4-4L3 16l-1 4Z" />
                  <path d="M14 14h6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => chooseTool("web_search")}
                className="grid size-10 place-items-center rounded-full text-[color:var(--text-secondary)] hover:bg-slate-800"
                title="Web search"
                aria-label="Web search"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18" />
                  <path d="M12 3a14 14 0 0 1 0 18" />
                  <path d="M12 3a14 14 0 0 0 0 18" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setShowContextMenu((value) => !value)}
                className="grid size-10 place-items-center rounded-full text-[color:var(--text-secondary)] hover:bg-slate-800"
                title="More tools"
                aria-label="More tools"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
                  <circle cx="5" cy="12" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="19" cy="12" r="1.7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setShowRdMenu((value) => !value)}
                className="grid size-10 place-items-center rounded-full text-[color:var(--text-secondary)] hover:bg-slate-800"
                title="R&D evidence"
                aria-label="R&D evidence"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                  <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
                  <path d="M12 12 4 7.5" />
                  <path d="m12 12 8-4.5" />
                  <path d="M12 12v9" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => void toggleRecording()}
                className={`grid size-10 place-items-center rounded-full border ${recording ? "bg-red-500 text-white" : "text-[color:var(--text-secondary)]"}`}
                style={{ borderColor: "var(--border)" }}
                title={recording ? "Stop recording" : "Record audio"}
                aria-label={recording ? "Stop recording" : "Record audio"}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <path d="M12 19v3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => void (mode === "release_check" ? runCheck() : sendChat())}
                disabled={busy || (!input.trim() && !uploadedFiles.length)}
                className="grid size-10 place-items-center rounded-full bg-emerald-500 text-sm font-black text-slate-950 disabled:opacity-50"
                title="Send"
              >
                ↑
              </button>
            </div>
          </div>
          {showModeMenu ? (
            <div className="absolute bottom-16 right-3 z-10 w-72 rounded-3xl border bg-[color:var(--surface)] p-3 shadow-2xl" style={{ borderColor: "var(--border)" }}>
              <p className="px-3 py-2 text-sm font-bold text-[color:var(--text-muted)]">Latest · 5.5</p>
              <button
                type="button"
                onClick={() => {
                  setMode("ask_openai");
                  setRunMode("instant");
                  setShowModeMenu(false);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-muted)]"
              >
                Instant
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("ask_openai");
                  setRunMode("thinking");
                  setShowModeMenu(false);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-muted)]"
              >
                Thinking <span className="font-semibold text-[color:var(--text-muted)]">· Extended</span>
              </button>
              <div className="my-2 border-t" style={{ borderColor: "var(--border)" }} />
              <button
                type="button"
                onClick={() => {
                  setShowModeMenu(false);
                  setShowContextMenu(true);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-muted)]"
              >
                Configure...
              </button>
              <div className="mt-2 rounded-2xl bg-[color:var(--surface-muted)] p-2">
                <p className="px-2 py-1 text-xs font-black uppercase tracking-wide text-[color:var(--text-muted)]">Gateway modes</p>
                {MODES.filter((item) => item.id !== "ask_openai").map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setMode(item.id);
                      setShowModeMenu(false);
                    }}
                    className="block w-full rounded-xl px-2 py-1.5 text-left text-xs font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface)]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {showRdMenu ? (
            <div className="absolute bottom-16 right-24 z-10 w-56 rounded-2xl border bg-[color:var(--surface)] p-2 shadow-2xl" style={{ borderColor: "var(--border)" }}>
              <p className="px-3 py-2 text-xs font-black uppercase tracking-wide text-[color:var(--text-muted)]">R&D</p>
              <button
                type="button"
                onClick={() => void saveRdEvidence()}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              >
                Add to R&D
              </button>
              <button
                type="button"
                onClick={() => void saveRdEvidence()}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={openRdPdf}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              >
                PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRdMenu(false);
                  setShowAiProviderPanel(true);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              >
                AI Providers
              </button>
            </div>
          ) : null}
          {showContextMenu ? (
            <div className="absolute bottom-16 left-3 z-10 max-h-[70vh] w-[min(28rem,calc(100vw-2rem))] overflow-auto rounded-2xl border bg-[color:var(--surface)] p-3 shadow-2xl" style={{ borderColor: "var(--border)" }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wide text-[color:var(--text-muted)]">Context & Files</p>
                <button type="button" onClick={() => setContextKeys([])} className="text-xs font-bold text-[color:var(--text-secondary)] underline">Clear</button>
              </div>
              <div className="mb-3 space-y-1">
                <label
                  className="block cursor-pointer rounded-xl px-3 py-2 text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
                >
                  Add photos & files
                  <input
                    type="file"
                    accept="image/*,.txt,.md,.csv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.sql,.log,.pdf,.doc,.docx"
                    multiple
                    className="hidden"
                    onChange={(event) => void handleFileUpload(event.target.files)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => chooseTool("recent_files")}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
                >
                  Recent files
                </button>
                <div className="my-2 border-t" style={{ borderColor: "var(--border)" }} />
                <button type="button" onClick={() => chooseTool("create_image")} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]">Create image</button>
                <button type="button" onClick={() => chooseTool("deep_research")} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]">Deep research</button>
                <button type="button" onClick={() => chooseTool("web_search")} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]">Web search</button>
                <div className="my-2 border-t" style={{ borderColor: "var(--border)" }} />
                <button type="button" onClick={() => chooseTool("agent_mode")} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]">Agent mode</button>
                <button type="button" onClick={() => chooseTool("add_sources")} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]">Add sources</button>
                <button type="button" onClick={() => chooseTool("create_task")} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]">Create task</button>
                <button type="button" onClick={() => chooseTool("openai_platform")} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]">OpenAI Platform</button>
                <div className="my-2 border-t" style={{ borderColor: "var(--border)" }} />
                <button
                  type="button"
                  onClick={() => setShowProjectsMenu((value) => !value)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
                >
                  <span>Projects</span>
                  <span>›</span>
                </button>
              </div>
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setUploadedFiles([])}
                  className="rounded-xl border px-3 py-2 text-left text-xs font-bold text-[color:var(--text-secondary)] disabled:opacity-50"
                  style={{ borderColor: "var(--border)" }}
                  disabled={!uploadedFiles.length}
                >
                  Clear uploaded files
                </button>
              </div>
              {uploadedFiles.length ? (
                <div className="mb-3 rounded-xl bg-[color:var(--surface-muted)] p-2">
                  <p className="text-xs font-bold text-[color:var(--text-primary)]">Save uploaded context only if requested</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void saveUploadedContext("dev_note")} className="rounded-full border px-3 py-1 text-xs text-[color:var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>Dev Note</button>
                    <button type="button" onClick={() => void saveUploadedContext("knowledge")} className="rounded-full border px-3 py-1 text-xs text-[color:var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>Knowledge Proposal</button>
                    <button type="button" onClick={() => void saveUploadedContext("prompt_rule")} className="rounded-full border px-3 py-1 text-xs text-[color:var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>Prompt Rule</button>
                    <button type="button" onClick={() => void saveUploadedContext("creator_profile")} className="rounded-full border px-3 py-1 text-xs text-[color:var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>Creator Profile</button>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {CONTEXT_OPTIONS.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-xl bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={contextKeys.includes(key)}
                      onChange={(event) =>
                        setContextKeys((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {showContextMenu && showProjectsMenu ? (
            <div
              className="absolute bottom-16 z-20 w-72 rounded-3xl border bg-[color:var(--surface)] p-3 shadow-2xl"
              style={{ borderColor: "var(--border)", left: "min(30rem, calc(100vw - 19rem))" }}
            >
              <p className="px-3 py-2 text-xs font-black uppercase tracking-wide text-[color:var(--text-muted)]">Projects</p>
              <button
                type="button"
                onClick={() => {
                  setShowProjectsMenu(false);
                  setShowRdMenu(true);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              >
                R&D evidence
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProjectsMenu(false);
                  chooseTool("create_task");
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              >
                Cursor tasks
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProjectsMenu(false);
                  chooseTool("add_sources");
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
              >
                Plexa sources
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {busy ? (
            <R365Button variant="ghost" onClick={stop}>
              Stop
            </R365Button>
          ) : null}
          {result ? (
            <>
              <R365Button variant="ghost" onClick={() => void copy(qaChecklist, "QA checklist")}>
                Copy QA Checklist
              </R365Button>
              <R365Button variant="ghost" onClick={() => void copy(result.cursorFixPrompt, "Cursor fix prompt")}>
                Copy Cursor Fix Prompt
              </R365Button>
            </>
          ) : null}
        </div>
        {showAiProviderPanel ? (
          <AiProviderGatewayPanel onClose={() => setShowAiProviderPanel(false)} />
        ) : null}
        {error ? <p className="text-sm font-semibold text-[color:var(--danger)]">{error}</p> : null}
        {status ? <p className="text-sm font-semibold text-emerald-300">{status}</p> : null}
        {result ? (
          <section className="space-y-3 rounded-2xl border bg-[color:var(--surface)] p-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide text-[color:var(--text-primary)]" style={{ borderColor: "var(--border)" }}>
                {result.decision}
              </span>
              <span className="rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide text-[color:var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>
                Risk: {result.riskLevel}
              </span>
              {model ? <span className="text-xs font-semibold text-[color:var(--text-muted)]">{model}</span> : null}
            </div>
            <p className="text-sm leading-6 text-[color:var(--text-secondary)]">{result.releaseSummary}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-[color:var(--surface-muted)] p-3">
                <p className="text-xs font-black uppercase tracking-wide text-[color:var(--text-muted)]">Risks</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[color:var(--text-secondary)]">
                  {result.risks.slice(0, 6).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="rounded-xl bg-[color:var(--surface-muted)] p-3">
                <p className="text-xs font-black uppercase tracking-wide text-[color:var(--text-muted)]">Smoke Tests</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[color:var(--text-secondary)]">
                  {result.smokeTests.slice(0, 6).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  ) : null;

  if (!allowed) return null;

  if (embedded) return popout;

  return (
    <>
      <button
        type="button"
        onClick={openPopout}
        className={triggerClassName ?? "rounded-full border px-4 py-2 text-sm font-bold text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-hover)]"}
        style={{ borderColor: "var(--border)", ...(floating ? { position: "fixed", right: "1rem", bottom: "1rem", zIndex: 70, background: "var(--surface)" } : {}) }}
      >
        {triggerLabel}
      </button>
      {popout && typeof document !== "undefined" ? createPortal(popout, document.body) : null}
    </>
  );
}
