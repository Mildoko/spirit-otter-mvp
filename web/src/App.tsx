import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ChatTurnResponse, CharacterDiagnostics, EmotionDiagnostics, ResponseSource, RuntimeInfo, SceneState } from "@otter/shared";
import { api, ApiError, createRequestId, type BootstrapData } from "./lib/api";
import { Onboarding } from "./components/Onboarding";
import { ActionCard } from "./components/ActionCard";
import { EmotionInterpretationCard } from "./components/EmotionInterpretationCard";
import otterPng from "./assets/spirit-otter.png";
import otterWebp from "./assets/spirit-otter.webp";

type Message = BootstrapData["messages"][number];
type Action = BootstrapData["actions"][number];

export function App() {
  const [loading, setLoading] = useState(true);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [lastResponseSource, setLastResponseSource] = useState<ResponseSource | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [followups, setFollowups] = useState<BootstrapData["followups"]>([]);
  const [scene, setScene] = useState<SceneState>("quiet_water");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emotionFeedback, setEmotionFeedback] = useState<ChatTurnResponse["emotionFeedback"]>();
  const [emotionDiagnostics, setEmotionDiagnostics] = useState<EmotionDiagnostics>();
  const [emotionInterpretation, setEmotionInterpretation] = useState<ChatTurnResponse["emotionInterpretation"]>();
  const [emotionTurnId, setEmotionTurnId] = useState<string | null>(null);
  const [characterDiagnostics, setCharacterDiagnostics] = useState<CharacterDiagnostics>();
  const [emotionFeedbackEnabled, setEmotionFeedbackEnabled] = useState(() => window.localStorage.getItem("otter-emotion-feedback") !== "off");
  const [lastSafetyTurn, setLastSafetyTurn] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timeReminder, setTimeReminder] = useState(false);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [aiReminderDismissed, setAiReminderDismissed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const hydrate = (data: BootstrapData) => {
    setBootstrap(data);
    setMessages(data.messages);
    setActions(data.actions);
    setFollowups(data.followups);
    setEmotionInterpretation(data.lastEmotion?.interpretation);
    setEmotionTurnId(data.lastEmotion?.turnId ?? null);
    setScene(data.messages.length === 0 ? "quiet_water" : "underwater_companion");
  };

  useEffect(() => {
    api.runtime().then(async (info) => {
      setRuntime(info);
      try { hydrate(await api.bootstrap()); }
      catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 401) setError(reason instanceof Error ? reason.message : "无法载入会话");
      }
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "无法载入运行状态"))
      .finally(() => setLoading(false));
    const timer = window.setTimeout(() => setTimeReminder(true), 2 * 60 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, actions]);

  useEffect(() => {
    if (!emotionFeedback) return;
    const timer = window.setTimeout(() => setEmotionFeedback(undefined), 6500);
    return () => window.clearTimeout(timer);
  }, [emotionFeedback]);

  const activeAction = useMemo(() => actions.find((item) => item.status !== "deleted") ?? null, [actions]);

  const redeem = async (inviteCode: string) => {
    setError(null);
    try {
      await api.redeem({
        inviteCode,
        adultConfirmed: true,
        aiDisclosureAccepted: true,
        cloudProcessingAccepted: true,
        dataConsentAccepted: true,
      });
      hydrate(await api.bootstrap());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "邀请码验证失败，请重试");
    }
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!bootstrap || busy) return;
    const text = input.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setEmotionFeedback(undefined);
    const optimistic: Message = { id: `local-${createRequestId()}`, role: "user", content: text, createdAt: new Date().toISOString() };
    setMessages((items) => [...items, optimistic]);
    setInput("");
    try {
      const result = await api.turn({ conversationId: bootstrap.conversation.id, text });
      setMessages((items) => [...items, result.reply]);
      setScene(result.scene);
      if (result.action) setActions((items) => [result.action!, ...items.filter((item) => item.id !== result.action!.id)]);
      setLastSafetyTurn(result.safety === "direct_support" ? result.turnId : null);
      setEmotionFeedback(result.safety === "normal" && emotionFeedbackEnabled ? result.emotionFeedback : undefined);
      setEmotionDiagnostics(result.safety === "normal" ? result.emotionDiagnostics : undefined);
      setEmotionInterpretation(result.safety === "normal" && emotionFeedbackEnabled ? result.emotionInterpretation : undefined);
      setEmotionTurnId(result.emotionInterpretation ? result.turnId : null);
      setCharacterDiagnostics(result.safety === "normal" ? result.characterDiagnostics : undefined);
      setLastResponseSource(result.responseSource);
      setOperationNotice(result.safety === "direct_support" ? "已切换为直接安全支持" : "回复已收到");
    } catch (reason) {
      setMessages((items) => items.filter((item) => item.id !== optimistic.id));
      setInput(text);
      setError(reason instanceof Error ? reason.message : "消息没有送达，请重试");
    } finally { setBusy(false); }
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
        <div className="topbar-actions"><button ref={settingsButtonRef} className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="打开设置">···</button></div>
      </header>

      {runtime?.mode === "demo" && <aside className="runtime-banner" role="status">
        <strong>本地演示，不保存数据</strong>
        <span>{lastResponseSource === "cloud_model" || (!lastResponseSource && runtime.modelSource === "cloud_model") ? "真实模型" : lastResponseSource === "static_safety" ? "安全静态响应" : "规则模拟"}</span>
        <small>版本 {runtime.buildVersion}</small>
      </aside>}
      {runtime && runtime.buildVersion !== __BUILD_VERSION__ && <aside className="version-warning" role="alert">页面与 API 版本不一致，请重新构建并重启服务。</aside>}

      {(timeReminder || (!aiReminderDismissed && bootstrap.aiReminder)) && <aside className="ai-reminder"><span>{timeReminder ? "你已经连续使用一段时间。这里是 AI 服务，先离开屏幕休息一下也很好。" : bootstrap.aiReminder}</span><button onClick={() => { setTimeReminder(false); setAiReminderDismissed(true); }} aria-label="关闭提醒">×</button></aside>}

      <section className="experience-layout">
        <aside className="character-panel" aria-label="灵体水獭场景">
          <div className="scene-caption"><span>{scene === "surface_organize" ? "水面 · 聚焦一件事" : scene === "near_surface_transition" ? "近水面 · 看清一点" : scene === "safety_plain" ? "直接支持" : "静水区 · 先听你说"}</span></div>
          {scene !== "safety_plain" && <div className="otter-stage">
            <picture><source srcSet={otterWebp} type="image/webp" /><img src={otterPng} alt="一只安静、克制地陪在水面的灵体水獭" className="otter-image" /></picture>
            {emotionFeedbackEnabled && emotionFeedback && emotionFeedback.cues.length > 0 && <div className="emotion-floats" aria-label={emotionFeedback.disclaimer}>
              {emotionFeedback.cues.map((cue, index) => <span key={`${emotionFeedback.observedAt}-${cue.dimension}`} className={`emotion-float emotion-${cue.tone} emotion-slot-${index + 1}`}>{cue.text}</span>)}
              <small>{emotionFeedback.disclaimer}</small>
            </div>}
          </div>}
          {emotionFeedbackEnabled && emotionInterpretation && emotionTurnId && scene !== "safety_plain" && <EmotionInterpretationCard
            turnId={emotionTurnId}
            interpretation={emotionInterpretation}
            onCorrect={async (verdict, labels) => {
              const result = await api.correctEmotion({ turnId: emotionTurnId, verdict, ...(labels ? { labels } : {}) });
              setEmotionInterpretation(result.emotionInterpretation);
              setOperationNotice(verdict === "accurate" ? "已记录：这次猜测准确" : "已按你的纠正更新，本次会话下一轮会参考");
            }}
          />}
          {runtime?.emotionDiagnosticsAvailable && emotionDiagnostics && scene !== "safety_plain" && <section className="emotion-diagnostics" aria-label="情绪状态诊断">
            <strong>状态诊断 · {emotionDiagnostics.signalSource === "cloud_model" ? "真实模型" : "本地规则"}</strong>
            {(["valence", "arousal", "stressLoad", "cognitiveOverload", "supportNeed"] as const).map((key) => <div key={key}>
              <span>{({ valence: "情绪倾向", arousal: "唤醒度", stressLoad: "压力负荷", cognitiveOverload: "认知过载", supportNeed: "支持需求" })[key]}</span>
              <output>{emotionDiagnostics.smoothed[key].toFixed(2)}</output>
              <small>{emotionDiagnostics.changes[key] > 0.01 ? "↑" : emotionDiagnostics.changes[key] < -0.01 ? "↓" : "→"}</small>
            </div>)}
            <div><span>控制感</span><output>{emotionDiagnostics.control.toFixed(2)}</output><small>·</small></div>
            <p>情绪状态 {emotionDiagnostics.emotionStatus} · 主体 {emotionDiagnostics.emotionSubject}<br />置信度 {emotionDiagnostics.confidence.toFixed(2)}{emotionDiagnostics.evidenceSpans.length ? ` · 证据：${emotionDiagnostics.evidenceSpans.join("、")}` : ""}</p>
            {characterDiagnostics && <p>角色路由：{characterDiagnostics.activeSpirit} · {characterDiagnostics.transitionStyle} · 锁定 {characterDiagnostics.lockTurnsRemaining} 轮<br />原因：{characterDiagnostics.reasonCodes.join("、")} · 版本 {characterDiagnostics.characterVersion}</p>}
          </section>}
          {scene === "safety_plain" && <div className="safety-symbol" aria-hidden="true">!</div>}
          <blockquote>{scene === "surface_organize" ? "我们只捞起眼前的一件事。" : scene === "safety_plain" ? "现在先把安全放在最前面。" : "我在听，不急着把你推向答案。"}</blockquote>
        </aside>

        <section className="conversation-card" aria-label="与灵体水獭的对话">
          {followups.length > 0 && <div className="followup-stack">
            {followups.map((item) => <article className="followup-card" key={item.id}>
              <span>上次留下的小物件</span><p>{item.action.text}</p>
              <div><button onClick={() => api.updateFollowup(item.id, "completed").then(() => setFollowups((all) => all.filter((entry) => entry.id !== item.id)))}>已经处理</button><button className="ghost" onClick={() => api.updateFollowup(item.id, "closed").then(() => setFollowups((all) => all.filter((entry) => entry.id !== item.id)))}>先收起来</button></div>
            </article>)}
          </div>}

          <div className="messages" aria-live="polite">
            {messages.length === 0 && <div className="empty-state"><p>今天想从哪里开始？</p><span>不用选择方式。你可以只是说说，也可以直接告诉澜泊想把哪件事理清一点。</span></div>}
            {messages.map((message) => <article key={message.id} className={`message message-${message.role}`}><span>{message.role === "assistant" ? "水獭" : "你"}</span><p>{message.content}</p></article>)}
            {busy && <article className="message message-assistant thinking"><span>水獭</span><p><i /><i /><i /></p></article>}
            {activeAction && <ActionCard action={activeAction} onConfirm={async (text) => { await api.confirmAction(activeAction.id, "confirm", text); refreshAction(activeAction.id, { text, status: "confirmed" }); }} onAbandon={async () => { await api.confirmAction(activeAction.id, "abandon"); refreshAction(activeAction.id, { status: "deleted" }); }} onUpdate={async (status) => { await api.updateAction(activeAction.id, status); refreshAction(activeAction.id, { status }); }} onFollowup={async () => { const due = new Date(Date.now() + 24 * 60 * 60 * 1000); await api.createFollowup(activeAction.id, due.toISOString()); }} />}
            {lastSafetyTurn && <button className="research-help" onClick={() => api.requestHelp(lastSafetyTurn).then((result) => setError(`已记录请求：${result.contact}`))}>请现场研究人员过来</button>}
            <div ref={endRef} />
          </div>

          {error && <p className="inline-error" role="alert">{error}</p>}
          {operationNotice && <p className="operation-notice" role="status" aria-live="polite">{operationNotice}</p>}
          <form className="composer" onSubmit={send}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={scene === "surface_organize" || scene === "near_surface_transition" ? "把眼前最想理清的一件事放在这里…" : "把此刻最压着你的部分放在这里…"} rows={2} maxLength={6000} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
            <button disabled={busy || !input.trim()} aria-label="发送消息">↑</button>
          </form>
          <p className="composer-note">AI 可能出错；紧急情况请优先联系现场人员或现实支持。</p>
        </section>
      </section>

      {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => { setSettingsOpen(false); settingsButtonRef.current?.focus(); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={(event) => { if (event.key === "Escape") { setSettingsOpen(false); settingsButtonRef.current?.focus(); } }} onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" autoFocus onClick={() => { setSettingsOpen(false); settingsButtonRef.current?.focus(); }} aria-label="关闭设置">×</button>
        <p className="eyebrow">数据与边界</p><h2 id="settings-title">你的控制权</h2>
        <dl><div><dt>匿名研究编号</dt><dd>{bootstrap.researchId}</dd></div><div><dt>本地保存</dt><dd>对话及系统自动提取的可能重要信息，最长 30 天</dd></div><div><dt>云端处理</dt><dd>对话会发送给模型供应商；本地删除不控制其日志。</dd></div><div><dt>反馈、申诉或求助</dt><dd>{bootstrap.researchContact}</dd></div></dl>
        <label className="setting-toggle"><input type="checkbox" checked={emotionFeedbackEnabled} onChange={(event) => { const enabled = event.target.checked; setEmotionFeedbackEnabled(enabled); window.localStorage.setItem("otter-emotion-feedback", enabled ? "on" : "off"); if (!enabled) { setEmotionFeedback(undefined); setEmotionInterpretation(undefined); } }} /><span>显示情绪变化与水獭猜测</span></label>
        <p className="settings-footnote">情绪提示只是 AI 对这一刻的暂时理解，可能不准确。</p>
        <button className="secondary-button" onClick={() => void api.exportMe()}>导出我的数据</button>
        <button className="secondary-button" onClick={async () => { await api.logout(); window.location.reload(); }}>退出本次会话</button>
        <button className="danger-button" onClick={async () => { if (window.confirm("确定永久删除本地全部对话、记忆、行动和回访吗？")) { await api.deleteMe(); window.location.reload(); } }}>永久删除本地数据</button>
        <p className="settings-footnote">本产品不是医疗或心理诊断服务。你可以随时关闭页面，不需要向角色解释。</p>
      </section></div>}
    </main>
  );
}
