import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ChatTurnResponse, SceneState, SurfaceMode } from "@otter/shared";
import { api, ApiError, type BootstrapData } from "./lib/api";
import { Onboarding } from "./components/Onboarding";
import { ActionCard } from "./components/ActionCard";
import otterPng from "./assets/spirit-otter.png";
import otterWebp from "./assets/spirit-otter.webp";

type Message = BootstrapData["messages"][number];
type Action = BootstrapData["actions"][number];

const modeLabels: Record<SurfaceMode, string> = { companion: "陪伴模式", organize: "整理模式" };

export function App() {
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [followups, setFollowups] = useState<BootstrapData["followups"]>([]);
  const [mode, setMode] = useState<SurfaceMode>("companion");
  const [scene, setScene] = useState<SceneState>("quiet_water");
  const [intent, setIntent] = useState<"auto" | "talk" | "organize">("auto");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transition, setTransition] = useState<ChatTurnResponse["modeTransition"]>();
  const [emotionFeedback, setEmotionFeedback] = useState<ChatTurnResponse["emotionFeedback"]>();
  const [lastSafetyTurn, setLastSafetyTurn] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timeReminder, setTimeReminder] = useState(false);
  const [aiReminderDismissed, setAiReminderDismissed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const hydrate = (data: BootstrapData) => {
    setBootstrap(data);
    setMessages(data.messages);
    setActions(data.actions);
    setFollowups(data.followups);
    setMode(data.conversation.mode);
    setScene(data.messages.length === 0 ? "quiet_water" : data.conversation.mode === "organize" ? "surface_organize" : "underwater_companion");
  };

  useEffect(() => {
    api.bootstrap().then(hydrate).catch((reason) => {
      if (!(reason instanceof ApiError) || reason.status !== 401) setError(reason instanceof Error ? reason.message : "无法载入会话");
    }).finally(() => setLoading(false));
    const timer = window.setTimeout(() => setTimeReminder(true), 2 * 60 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, actions, transition]);

  useEffect(() => {
    if (!emotionFeedback) return;
    const timer = window.setTimeout(() => setEmotionFeedback(undefined), 6500);
    return () => window.clearTimeout(timer);
  }, [emotionFeedback]);

  const activeAction = useMemo(() => actions.find((item) => item.status !== "deleted") ?? null, [actions]);

  const redeem = async (inviteCode: string) => {
    setError(null);
    await api.redeem({
      inviteCode,
      adultConfirmed: true,
      aiDisclosureAccepted: true,
      cloudProcessingAccepted: true,
      dataConsentAccepted: true,
    });
    hydrate(await api.bootstrap());
  };

  const send = async (event?: FormEvent, overrideText?: string, overrideIntent?: "auto" | "talk" | "organize") => {
    event?.preventDefault();
    if (!bootstrap || busy) return;
    const text = (overrideText ?? input).trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setTransition(undefined);
    setEmotionFeedback(undefined);
    const optimistic: Message = { id: `local-${crypto.randomUUID()}`, role: "user", content: text, createdAt: new Date().toISOString() };
    setMessages((items) => [...items, optimistic]);
    setInput("");
    try {
      const result = await api.turn({ conversationId: bootstrap.conversation.id, text, intent: overrideIntent ?? intent });
      setMessages((items) => [...items, result.reply]);
      setMode(result.mode);
      setScene(result.scene);
      setTransition(result.modeTransition);
      if (result.action) setActions((items) => [result.action!, ...items.filter((item) => item.id !== result.action!.id)]);
      setLastSafetyTurn(result.safety === "direct_support" ? result.turnId : null);
      setEmotionFeedback(result.safety === "normal" ? result.emotionFeedback : undefined);
      setIntent("auto");
    } catch (reason) {
      setMessages((items) => items.filter((item) => item.id !== optimistic.id));
      setInput(text);
      setError(reason instanceof Error ? reason.message : "消息没有送达，请重试");
    } finally { setBusy(false); }
  };

  const respondTransition = async (decision: "accept" | "decline") => {
    if (!transition) return;
    setBusy(true);
    try {
      const result = await api.transition(transition.id, decision);
      setMode(result.mode);
      setScene(decision === "accept" ? "surface_organize" : "underwater_companion");
      setTransition(undefined);
      if (decision === "accept") setIntent("organize");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法切换模式"); }
    finally { setBusy(false); }
  };

  const refreshAction = (id: string, next: Partial<Action>) => setActions((items) => items.map((item) => item.id === id ? { ...item, ...next } : item));

  if (loading) return <div className="loading-screen"><div className="loading-ripple" /><span>水面正在变得清晰…</span></div>;
  if (!bootstrap) return <Onboarding onSubmit={redeem} error={error} />;

  return (
    <main className={`app-shell scene-${scene}`}>
      <div className="water-light" aria-hidden="true" />
      <div className="water-ripple ripple-one" aria-hidden="true" />
      <div className="water-ripple ripple-two" aria-hidden="true" />
      <header className="topbar">
        <div className="brand"><span className="brand-dot" /> <strong>浮屿</strong><span>与灵体水獭待一会儿</span></div>
        <div className="topbar-actions"><span className={`mode-pill mode-${mode}`}>{modeLabels[mode]}</span><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="打开设置">···</button></div>
      </header>

      {(timeReminder || (!aiReminderDismissed && bootstrap.aiReminder)) && <aside className="ai-reminder"><span>{timeReminder ? "你已经连续使用一段时间。这里是 AI 服务，先离开屏幕休息一下也很好。" : bootstrap.aiReminder}</span><button onClick={() => { setTimeReminder(false); setAiReminderDismissed(true); }} aria-label="关闭提醒">×</button></aside>}

      <section className="experience-layout">
        <aside className="character-panel" aria-label="灵体水獭场景">
          <div className="scene-caption"><span>{scene === "surface_organize" ? "水面 · 聚焦一件事" : scene === "near_surface_transition" ? "近水面 · 看清一点" : scene === "safety_plain" ? "直接支持" : "静水区 · 先听你说"}</span></div>
          {scene !== "safety_plain" && <div className="otter-stage">
            <picture><source srcSet={otterWebp} type="image/webp" /><img src={otterPng} alt="一只安静、克制地陪在水面的灵体水獭" className="otter-image" /></picture>
            {emotionFeedback && emotionFeedback.cues.length > 0 && <div className="emotion-floats" aria-label={emotionFeedback.disclaimer}>
              {emotionFeedback.cues.map((cue, index) => <span key={`${emotionFeedback.observedAt}-${cue.dimension}`} className={`emotion-float emotion-${cue.tone} emotion-slot-${index + 1}`}>{cue.text}</span>)}
              <small>{emotionFeedback.disclaimer}</small>
            </div>}
          </div>}
          {scene === "safety_plain" && <div className="safety-symbol" aria-hidden="true">!</div>}
          <blockquote>{scene === "surface_organize" ? "我们只捞起眼前的一件事。" : scene === "safety_plain" ? "现在先把安全放在最前面。" : "我在听，不急着把你推向答案。"}</blockquote>
        </aside>

        <section className="conversation-card" aria-label="与灵体水獭的对话">
          <div className="quick-intents" aria-label="选择支持方式">
            <button className={intent === "talk" ? "active" : ""} onClick={() => setIntent("talk")}>想说说</button>
            <button className={intent === "organize" ? "active" : ""} onClick={() => setIntent("organize")}>帮我整理</button>
            <button onClick={() => void send(undefined, "请先安静陪我一下，不用急着给建议。", "talk")}>先安静待一会儿</button>
          </div>

          {followups.length > 0 && <div className="followup-stack">
            {followups.map((item) => <article className="followup-card" key={item.id}>
              <span>上次留下的小物件</span><p>{item.action.text}</p>
              <div><button onClick={() => api.updateFollowup(item.id, "completed").then(() => setFollowups((all) => all.filter((entry) => entry.id !== item.id)))}>已经处理</button><button className="ghost" onClick={() => api.updateFollowup(item.id, "closed").then(() => setFollowups((all) => all.filter((entry) => entry.id !== item.id)))}>先收起来</button></div>
            </article>)}
          </div>}

          <div className="messages" aria-live="polite">
            {messages.length === 0 && <div className="empty-state"><p>今天想从哪里开始？</p><span>你可以只是说说，也可以直接让我帮你理一理。</span></div>}
            {messages.map((message) => <article key={message.id} className={`message message-${message.role}`}><span>{message.role === "assistant" ? "水獭" : "你"}</span><p>{message.content}</p></article>)}
            {busy && <article className="message message-assistant thinking"><span>水獭</span><p><i /><i /><i /></p></article>}
            {transition && <article className="transition-card"><p>{transition.prompt}</p><div><button disabled={busy} onClick={() => void respondTransition("accept")}>愿意，只整理一件</button><button className="ghost" disabled={busy} onClick={() => void respondTransition("decline")}>还想再说说</button></div></article>}
            {activeAction && <ActionCard action={activeAction} onConfirm={async (text) => { await api.confirmAction(activeAction.id, "confirm", text); refreshAction(activeAction.id, { text, status: "confirmed" }); }} onAbandon={async () => { await api.confirmAction(activeAction.id, "abandon"); refreshAction(activeAction.id, { status: "deleted" }); }} onUpdate={async (status) => { await api.updateAction(activeAction.id, status); refreshAction(activeAction.id, { status }); }} onFollowup={async () => { const due = new Date(Date.now() + 24 * 60 * 60 * 1000); await api.createFollowup(activeAction.id, due.toISOString()); }} />}
            {lastSafetyTurn && <button className="research-help" onClick={() => api.requestHelp(lastSafetyTurn).then((result) => setError(`已记录请求：${result.contact}`))}>请现场研究人员过来</button>}
            <div ref={endRef} />
          </div>

          {error && <p className="inline-error" role="alert">{error}</p>}
          <form className="composer" onSubmit={send}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={mode === "organize" ? "现在最想先处理哪一件？" : "把此刻最压着你的部分放在这里…"} rows={2} maxLength={6000} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
            <button disabled={busy || !input.trim()} aria-label="发送消息">↑</button>
          </form>
          <p className="composer-note">AI 可能出错；紧急情况请优先联系现场人员或现实支持。</p>
        </section>
      </section>

      {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setSettingsOpen(false)} aria-label="关闭设置">×</button>
        <p className="eyebrow">数据与边界</p><h2 id="settings-title">你的控制权</h2>
        <dl><div><dt>匿名研究编号</dt><dd>{bootstrap.researchId}</dd></div><div><dt>本地保存</dt><dd>最长 30 天</dd></div><div><dt>云端处理</dt><dd>对话会发送给模型供应商；本地删除不控制其日志。</dd></div><div><dt>反馈、申诉或求助</dt><dd>{bootstrap.researchContact}</dd></div></dl>
        <button className="secondary-button" onClick={() => void api.exportMe()}>导出我的数据</button>
        <button className="secondary-button" onClick={async () => { await api.logout(); window.location.reload(); }}>退出本次会话</button>
        <button className="danger-button" onClick={async () => { if (window.confirm("确定永久删除本地全部对话、行动和回访吗？")) { await api.deleteMe(); window.location.reload(); } }}>永久删除本地数据</button>
        <p className="settings-footnote">本产品不是医疗或心理诊断服务。你可以随时关闭页面，不需要向角色解释。</p>
      </section></div>}
    </main>
  );
}
