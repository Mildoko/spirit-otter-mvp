import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import type { AgentIdV1, CharacterDiagnostics, ConversationFeedbackReason, ConversationFeedbackVerdict, EmotionDiagnostics, HealingMovementFeedback, HealingUnderstandingFeedback, PublicEmotionInterpretation, PublicPortalItemV01, ResponseSource, RuntimeInfo, SceneState, VisualActionV1 } from "@otter/shared";
import { api, ApiError, createRequestId, type BootstrapData } from "./lib/api";
import { Onboarding } from "./components/Onboarding";
import { ActionCard } from "./components/ActionCard";
import { SceneWorld, type RendererState, type WorldView } from "./components/SceneWorld";
import spiritDeerPng from "./assets/spirit-deer-zen-v1.png";
import spiritOtterPng from "./assets/spirit-otter.png";
import { useAudio } from "./audio/AudioProvider";
import { VoiceInputButton } from "./components/VoiceInputButton";
import { buildWelcomeMessage, type WelcomeMessageV1 } from "./lib/welcome";
import { mapTataExpression } from "./lib/otter-expression";
import { MemoryCenter } from "./components/MemoryCenter";
import { LandscapePrompt } from "./components/LandscapePrompt";
import { OuterCircleWorld } from "./components/OuterCircleWorld";
import { initialOuterCircleState, isOuterCircleActive, outerCircleReducer } from "./lib/outer-circle-state";
import { AgentSquadDock, agentUiRegistry } from "./components/AgentSquadDock";
import { buildAgentGreetingRequest } from "./lib/agent-greetings";

type Message = BootstrapData["messages"][number];
type Action = BootstrapData["actions"][number];
type CarriedOuterItem = { item: PublicPortalItemV01; target: AgentIdV1 };

const outerBoundaryStorageKey = "boonzoom-outer-boundary-v01";
const activeAgentStorageKey = "boonzoom-active-agent-v1";
const defaultVoiceProfileByAgent: Record<AgentIdV1, string> = {
  zen_deer: "zen_deer.deep_tide",
  spirit_otter: "spirit_otter.warm_companion",
  bird_courier: "bird_courier.concierge",
};

function storedAgentId(): AgentIdV1 {
  const value = window.sessionStorage.getItem(activeAgentStorageKey);
  return value === "spirit_otter" || value === "bird_courier" ? value : "zen_deer";
}

const followupOutcomeOptions = [
  { state: "not_started", label: "还没开始", notice: "收到，还没开始也没关系；这次先不追着它。" },
  { state: "partial_progress", label: "推进了一点", notice: "已经记录这点推进，不要求它必须一次做完。" },
  { state: "completed", label: "已经完成", notice: "已经记下完成。" },
  { state: "blocked", label: "卡住了", notice: "已经记下卡住；这不是失败，可以先停在这里。" },
  { state: "redefined", label: "想改轻一点", notice: "可以在对话里说想把它改到多轻，这次回访先收起来。" },
] as const;

export function App() {
  const audio = useAudio();
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
  const [emotionDiagnostics, setEmotionDiagnostics] = useState<EmotionDiagnostics>();
  const [emotionInterpretation, setEmotionInterpretation] = useState<PublicEmotionInterpretation>();
  const [characterDiagnostics, setCharacterDiagnostics] = useState<CharacterDiagnostics>();
  const [lastSafetyTurn, setLastSafetyTurn] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryCenterOpen, setMemoryCenterOpen] = useState(false);
  const [timeReminder, setTimeReminder] = useState(false);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [visualAction, setVisualAction] = useState<VisualActionV1>("idle");
  const [rendererState, setRendererState] = useState<RendererState>("loading");
  const [worldView, setWorldView] = useState<WorldView>(() => window.sessionStorage.getItem("otter-world-view") === "sky" ? "sky" : "horizon");
  const [aiReminderDismissed, setAiReminderDismissed] = useState(false);
  const [messageVoiceProfiles, setMessageVoiceProfiles] = useState<Record<string, string>>({});
  const [welcome, setWelcome] = useState<WelcomeMessageV1 | null>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [deepInterpretationEnabled, setDeepInterpretationEnabled] = useState(true);
  const [healingEndOpen, setHealingEndOpen] = useState(false);
  const [healingSegmentId, setHealingSegmentId] = useState<string | null>(null);
  const [feedbackVerdict, setFeedbackVerdict] = useState<ConversationFeedbackVerdict | null>(null);
  const [healingUnderstanding, setHealingUnderstanding] = useState<HealingUnderstandingFeedback | null>(null);
  const [healingMovement, setHealingMovement] = useState<HealingMovementFeedback | null>(null);
  const [healingReason, setHealingReason] = useState<ConversationFeedbackReason | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<AgentIdV1>(storedAgentId);
  const [outerState, dispatchOuter] = useReducer(outerCircleReducer, initialOuterCircleState);
  const [outerItems, setOuterItems] = useState<PublicPortalItemV01[]>([]);
  const [carriedOuterItem, setCarriedOuterItem] = useState<CarriedOuterItem | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const visualTimerRef = useRef<number | null>(null);
  const thinkingTimerRef = useRef<number | null>(null);
  const speechInputBaseRef = useRef("");
  const speechInputPolicyRef = useRef(audio.soundscapePolicy);
  const innerDialogWasOpenRef = useRef(false);
  const outerExitTimerRef = useRef<number | null>(null);

  const runVisualAction = (action: VisualActionV1, durationMs = 1800) => {
    if (visualTimerRef.current) window.clearTimeout(visualTimerRef.current);
    setVisualAction(action);
    if (action !== "safety_still" && action !== "think") {
      visualTimerRef.current = window.setTimeout(() => setVisualAction("idle"), durationMs);
    }
  };

  const hydrate = (data: BootstrapData) => {
    setBootstrap(data);
    setMessages(data.messages);
    setActions(data.actions);
    setFollowups(data.followups);
    setEmotionInterpretation(data.lastEmotion?.interpretation);
    setScene(data.messages.length === 0 ? "quiet_water" : "underwater_companion");
    setWelcome(buildWelcomeMessage(data.visit));
    setWelcomeVisible(true);
    setDeepInterpretationEnabled(data.experiencePreferences.deepInterpretationEnabled);
    if (data.conversation.activeAgentId) setActiveAgentId(data.conversation.activeAgentId);
    runVisualAction("notice", 2200);
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

  useEffect(() => () => {
    if (visualTimerRef.current) window.clearTimeout(visualTimerRef.current);
    if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current);
    if (outerExitTimerRef.current) window.clearTimeout(outerExitTimerRef.current);
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem("otter-world-view", worldView);
    if (runtime?.audioV1Enabled) audio.setWorldView(worldView);
  }, [audio, runtime?.audioV1Enabled, worldView]);

  useEffect(() => {
    audio.setCloudTtsEnabled(Boolean(runtime?.cloudTtsEnabled));
  }, [audio, runtime?.cloudTtsEnabled]);

  useEffect(() => {
    if (!welcomeVisible) return;
    const timer = window.setTimeout(() => setWelcomeVisible(false), 9_000);
    return () => window.clearTimeout(timer);
  }, [welcomeVisible, welcome?.text]);

  const activeAction = useMemo(() => actions.find((item) => item.status !== "deleted") ?? null, [actions]);
  const expressionCue = useMemo(() => mapTataExpression(emotionInterpretation, scene, welcomeVisible), [emotionInterpretation, scene, welcomeVisible]);
  const outerCircleActive = isOuterCircleActive(outerState.phase);
  const selectedOuterItem = outerItems.find((item) => item.id === outerState.selectedItemId);
  const activeAgent = agentUiRegistry[activeAgentId];
  const composerPlaceholder = activeAgentId === "spirit_otter"
    ? "和 tata 说说此刻过得怎么样…"
    : activeAgentId === "bird_courier"
      ? "把想安排的事、时间或偏好告诉飞儿…"
      : scene === "surface_organize" || scene === "near_surface_transition"
        ? "把眼前最想理清的一件事放在这里…"
        : scene === "surface_chat"
          ? "接着聊，或者直接说“换一个”…"
          : "把此刻最压着你的部分放在这里…";

  useEffect(() => {
    window.sessionStorage.setItem(activeAgentStorageKey, activeAgentId);
  }, [activeAgentId]);

  const redeem = async (inviteCode: string) => {
    setError(null);
    try {
      // The submit click is the mobile browser's required user gesture. Unlock
      // before the network round-trip so sound is ready when the experience opens.
      if (runtime?.audioV1Enabled && !audio.unlocked) await audio.unlock();
      await api.redeem({
        inviteCode,
        adultConfirmed: true,
        aiDisclosureAccepted: true,
        cloudProcessingAccepted: true,
        dataConsentAccepted: true,
        deepInterpretationAccepted: true,
      });
      hydrate(await api.bootstrap());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "邀请码验证失败，请重试");
    }
  };

  const sendText = async (rawText: string) => {
    if (!bootstrap || busy) return;
    const text = rawText.trim();
    if (!text) return;
    if (runtime?.audioV1Enabled) audio.cancelSpeech();
    setBusy(true);
    runVisualAction("listen", 700);
    if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current);
    thinkingTimerRef.current = window.setTimeout(() => setVisualAction("think"), 500);
    setError(null);
    const targetAgentId = activeAgentId;
    const optimistic: Message = { id: `local-${createRequestId()}`, role: "user", content: text, createdAt: new Date().toISOString(), agentId: targetAgentId };
    setMessages((items) => [...items, optimistic]);
    setInput("");
    try {
      const result = await api.turn({ conversationId: bootstrap.conversation.id, text, agentId: targetAgentId });
      if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current);
      setMessages((items) => [...items, result.reply]);
      setScene(result.scene);
      if (result.action) setActions((items) => [result.action!, ...items.filter((item) => item.id !== result.action!.id)]);
      setLastSafetyTurn(result.safety === "direct_support" ? result.turnId : null);
      setEmotionDiagnostics(result.safety === "normal" ? result.emotionDiagnostics : undefined);
      setEmotionInterpretation(result.safety === "normal" ? result.emotionInterpretation : undefined);
      setCharacterDiagnostics(result.safety === "normal" ? result.characterDiagnostics : undefined);
      setLastResponseSource(result.responseSource);
      setActiveAgentId(result.activeAgentId);
      setOperationNotice(result.safety === "direct_support" ? "已切换为直接安全支持" : "回复已收到");
      runVisualAction(result.visualCue?.action ?? "idle", result.visualCue?.durationMs ?? 1800);
      if (runtime?.audioV1Enabled && result.audioCue) {
        setMessageVoiceProfiles((profiles) => ({ ...profiles, [result.reply.id]: result.audioCue!.voiceProfileId }));
        audio.applySoundscapePolicy(result.audioCue.soundscapePolicy);
        if (result.audioCue.sfx !== "none") audio.playSfx(result.audioCue.sfx);
        audio.speak({ id: result.reply.id, text: result.reply.content, agentId: result.audioCue.agentId, profileId: result.audioCue.voiceProfileId });
      }
    } catch (reason) {
      if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current);
      runVisualAction("idle");
      setMessages((items) => items.filter((item) => item.id !== optimistic.id));
      setInput(text);
      setError(reason instanceof Error ? reason.message : "消息没有送达，请重试");
    } finally { setBusy(false); }
  };

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    void sendText(input);
  };

  const refreshAction = (id: string, next: Partial<Action>) => setActions((items) => items.map((item) => item.id === id ? { ...item, ...next } : item));
  const sceneWorldEnabled = Boolean(runtime?.sceneWorldV1Enabled);

  const playAgentGreeting = async (agentId: AgentIdV1) => {
    if (!runtime?.audioV1Enabled) return;
    await audio.unlock();
    audio.playSfx("approach_water");
    audio.speak(buildAgentGreetingRequest(agentId, String(Date.now())));
  };

  const activateAgent = (agentId: AgentIdV1) => {
    if (busy) return;
    audio.cancelSpeech();
    setActiveAgentId(agentId);
    runVisualAction("approach", 1200);
    void playAgentGreeting(agentId);
    setDialogOpen(true);
    setOperationNotice(`${agentUiRegistry[agentId].name}向你打了招呼，已接入这段对话。切换 Agent 不会自动发送消息。`);
  };

  const closeDialog = () => {
    runVisualAction("withdraw", 900);
    if (runtime?.audioV1Enabled) audio.playSfx("withdraw_water");
    setDialogOpen(false);
  };

  const loadOuterCircle = async () => {
    setError(null);
    try {
      const feed = await api.publicPortalFeed();
      setOuterItems(feed.items);
      dispatchOuter({ type: "loaded" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "外圈暂时没有显现，请留在船上稍后再试";
      dispatchOuter({ type: "load_failed", message });
      setDialogOpen(innerDialogWasOpenRef.current);
      setError(message);
    }
  };

  const openOuterCircle = () => {
    if (scene === "safety_plain") {
      setDialogOpen(true);
      setOperationNotice("现在先把安全放在前面，外圈入口暂时收起。你仍可以继续和鹿禅说话。");
      return;
    }
    innerDialogWasOpenRef.current = dialogOpen;
    const acknowledged = window.sessionStorage.getItem(outerBoundaryStorageKey) === "acknowledged";
    dispatchOuter({ type: "open", boundaryAcknowledged: acknowledged });
    if (acknowledged) {
      audio.cancelSpeech();
      setDialogOpen(false);
      void loadOuterCircle();
    }
  };

  const confirmOuterBoundary = () => {
    window.sessionStorage.setItem(outerBoundaryStorageKey, "acknowledged");
    dispatchOuter({ type: "acknowledge" });
    audio.cancelSpeech();
    setDialogOpen(false);
    void loadOuterCircle();
  };

  const finishOuterExit = (dialogShouldOpen: boolean) => {
    if (outerExitTimerRef.current) window.clearTimeout(outerExitTimerRef.current);
    outerExitTimerRef.current = window.setTimeout(() => {
      dispatchOuter({ type: "exited" });
      setDialogOpen(dialogShouldOpen);
      outerExitTimerRef.current = null;
    }, 260);
  };

  const returnToInnerCircle = () => {
    dispatchOuter({ type: "return" });
    finishOuterExit(innerDialogWasOpenRef.current);
  };

  const activateAgentFromOuter = (agentId: AgentIdV1) => {
    if (busy) return;
    activateAgent(agentId);
    dispatchOuter({ type: "return" });
    finishOuterExit(true);
  };

  const carryOuterItemInside = (item: PublicPortalItemV01, target: AgentIdV1) => {
    setCarriedOuterItem({ item, target });
    setActiveAgentId(target);
    setOperationNotice(target === "bird_courier"
      ? "公共内容已带回船上，飞儿已接入。她不会自动记录兴趣，也不会替你报名。"
      : `公共内容已带回船上，${agentUiRegistry[target].name}已接入。要不要聊，由你决定。`
    );
    dispatchOuter({ type: "return" });
    finishOuterExit(true);
  };

  const openHealingEnd = async () => {
    if (!bootstrap || busy) return;
    setHealingEndOpen(true);
    setFeedbackVerdict(null);
    setHealingUnderstanding(null);
    setHealingMovement(null);
    setHealingReason(null);
    setHealingSegmentId(null);
    try {
      const result = await api.requestHealingFeedback(bootstrap.conversation.id);
      setHealingSegmentId(result.segmentId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法打开反馈");
    }
  };

  const finishHealingSession = async (skipped = false) => {
    if (!bootstrap || busy) return;
    if (!feedbackVerdict && !skipped) return;
    setBusy(true);
    try {
      const segmentId = healingSegmentId ?? (await api.requestHealingFeedback(bootstrap.conversation.id)).segmentId;
      await api.endHealingSession(bootstrap.conversation.id, skipped
        ? { segmentId, skipped: true }
        : { segmentId, feedback: { schemaVersion: 2, verdict: feedbackVerdict!, ...(healingUnderstanding ? { understanding: healingUnderstanding } : {}), ...(healingMovement ? { movement: healingMovement } : {}), ...(healingReason ? { reason: healingReason } : {}) } });
      setHealingEndOpen(false);
      setHealingSegmentId(null);
      setFeedbackVerdict(null);
      setHealingUnderstanding(null);
      setHealingMovement(null);
      setHealingReason(null);
      setOperationNotice("本次聊天已结束；你仍可以从新的内容继续");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法结束本次聊天");
    } finally { setBusy(false); }
  };

  if (loading) return <><LandscapePrompt /><div className="loading-screen"><div className="loading-ripple" /><span>水面正在变得清晰…</span></div></>;
  if (!bootstrap) return <><LandscapePrompt /><Onboarding onSubmit={redeem} error={error} persistent={Boolean(runtime?.persistent)} soundEnabled={Boolean(runtime?.audioV1Enabled)} externalPreview={Boolean(runtime?.externalPreview)} /></>;

  return (
    <main className={`app-shell scene-${scene}${sceneWorldEnabled ? " scene-world-shell" : ""}${outerCircleActive ? " outer-circle-active" : ""}`}>
      <LandscapePrompt />
      {!outerCircleActive && !sceneWorldEnabled && <><div className="water-light" aria-hidden="true" /><div className="water-ripple ripple-one" aria-hidden="true" /><div className="water-ripple ripple-two" aria-hidden="true" /></>}
      {!outerCircleActive && sceneWorldEnabled && <SceneWorld
        action={visualAction}
        view={worldView}
        onViewChange={setWorldView}
        onSpiritActivate={() => activateAgent("zen_deer")}
        onRendererState={setRendererState}
        showDiagnostics={Boolean(runtime?.emotionDiagnosticsAvailable)}
        expressionCue={expressionCue}
        dialogOpen={dialogOpen}
        {...(welcomeVisible && welcome ? { welcomeText: welcome.text } : {})}
        {...(welcomeVisible && welcome?.timeLabel ? { welcomeTimeLabel: welcome.timeLabel } : {})}
      />}
      {outerCircleActive && <OuterCircleWorld
        phase={outerState.phase as "loading" | "gallery" | "detail" | "exiting"}
        items={outerItems}
        {...(selectedOuterItem ? { selectedItem: selectedOuterItem } : {})}
        onOpenItem={(item) => dispatchOuter({ type: "select", itemId: item.id })}
        onCloseDetail={() => dispatchOuter({ type: "close_detail" })}
        onReturnInner={returnToInnerCircle}
        onCarryInner={carryOuterItemInside}
        activeAgentId={activeAgentId}
        activeAgentName={activeAgent.name}
      />}
      {scene !== "safety_plain" && <AgentSquadDock activeAgentId={activeAgentId} disabled={busy} onActivate={outerCircleActive ? activateAgentFromOuter : activateAgent} />}
      <header className="topbar">
        <div className="brand-stack">
          <div className="brand"><span className="brand-dot" /> <strong>BoonZoom</strong><span>{outerCircleActive ? "外圈 · 万象廊" : `内圈 · ${activeAgent.name}在席`}</span></div>
        </div>
        <div className="topbar-actions">
          {!outerCircleActive && outerState.phase !== "boundary" && scene !== "safety_plain" && <button type="button" className="outer-entry-button" onClick={openOuterCircle}><span aria-hidden="true">◇</span> 去外圈看看</button>}
          {runtime?.audioV1Enabled && <button className={`sound-button sound-${audio.status}`} onClick={async () => {
            if (!audio.unlocked) await playAgentGreeting(activeAgentId);
            else audio.toggleMaster();
          }} aria-label={!audio.unlocked ? "开启声音" : audio.settings.masterEnabled ? "静音" : "恢复声音"} aria-pressed={audio.unlocked && audio.settings.masterEnabled}>
            <span aria-hidden="true">{!audio.unlocked ? "♪" : audio.settings.masterEnabled ? "◖))" : "◖×"}</span>{!audio.unlocked ? "开启声音" : audio.speaking ? "正在朗读" : audio.settings.masterEnabled ? "声音已开" : "已静音"}
          </button>}
          <button ref={settingsButtonRef} className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="打开设置">···</button>
        </div>
      </header>

      {runtime?.mode === "demo" && <aside className="runtime-banner" role="status">
        <strong>{runtime.externalPreview ? "受控外网体验，不保存数据" : "本地演示，不保存数据"}</strong>
        <span>{lastResponseSource === "cloud_model" || (!lastResponseSource && runtime.modelSource === "cloud_model") ? "真实模型" : lastResponseSource === "static_safety" ? "安全静态响应" : "规则模拟"}</span>
        <small>版本 {runtime.buildVersion}</small>
      </aside>}
      {runtime && runtime.buildVersion !== __BUILD_VERSION__ && <aside className="version-warning" role="alert">页面与 API 版本不一致，请重新构建并重启服务。</aside>}
      {sceneWorldEnabled && rendererState === "context_lost" && <aside className="version-warning" role="status">动态场景暂时不可用，已切换到静态画面；对话不受影响。</aside>}
      {runtime?.audioV1Enabled && audio.error && <aside className="audio-notice" role="status">{audio.error}</aside>}

      {(timeReminder || (!aiReminderDismissed && bootstrap.aiReminder)) && <aside className="ai-reminder"><span>{timeReminder ? "你已经连续使用一段时间。这里是 AI 服务，先离开屏幕休息一下也很好。" : bootstrap.aiReminder}</span><button onClick={() => { setTimeReminder(false); setAiReminderDismissed(true); }} aria-label="关闭提醒">×</button></aside>}

      {!outerCircleActive && <section className={`experience-layout${sceneWorldEnabled ? " world-experience-layout" : ""}`}>
        {!sceneWorldEnabled && <aside className="character-panel" aria-label={`${activeAgent.species}${activeAgent.name}的私密场景`}>
          <div className="scene-caption"><span>{scene === "surface_organize" ? "水面 · 聚焦一件事" : scene === "surface_chat" ? "水面 · 随便聊聊" : scene === "near_surface_transition" ? "近水面 · 看清一点" : scene === "safety_plain" ? "直接支持" : "静水区 · 先听你说"}</span></div>
          {scene !== "safety_plain" && <div className={`spirit-stage spirit-stage-${activeAgentId}`}>
            {activeAgentId === "zen_deer" && <img src={spiritDeerPng} alt="安坐水边的鹿灵鹿禅" className="spirit-image" />}
            {activeAgentId === "spirit_otter" && <img src={spiritOtterPng} alt="温暖靠近的水獭 tata" className="spirit-image spirit-image-otter" />}
            {activeAgentId === "bird_courier" && <div className="feier-stage-mark" role="img" aria-label="飞鸟信差飞儿"><i /><i /><i /><span>飞儿</span></div>}
            {activeAgentId === "zen_deer" && <div className={`tata-expression tata-expression-${expressionCue.expression}`} role="img" aria-label={expressionCue.label}><span aria-hidden="true">{expressionCue.symbol}</span></div>}
            {activeAgentId === "zen_deer" && welcomeVisible && welcome && <aside className="tata-welcome-bubble" role="status"><strong>鹿禅</strong><p>{welcome.text}</p>{welcome.timeLabel && <small>{welcome.timeLabel}</small>}</aside>}
          </div>}
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
          <blockquote>{scene === "safety_plain" ? "现在先把安全放在最前面。" : activeAgentId === "spirit_otter" ? "先照顾好此刻的人，再慢慢看事情。" : activeAgentId === "bird_courier" ? "条件说清楚，下一步才不会替你作主。" : scene === "surface_organize" ? "万事纷来，先照见眼前这一件。" : scene === "surface_chat" ? "这次由鹿禅讲一段新鲜的。" : "我在听，不急着把你推向答案。"}</blockquote>
        </aside>}

        {(!sceneWorldEnabled || dialogOpen) && <section className={`conversation-card face-dialogue${sceneWorldEnabled ? " conversation-drawer" : ""}`} aria-label={`与${activeAgent.name}的对话`}>
          {sceneWorldEnabled && <header className="drawer-header"><div><small>{activeAgent.species} · {activeAgent.shortRole}</small><strong>{activeAgent.name}在听</strong></div><button onClick={closeDialog} aria-label="收起对话">×</button></header>}
          {followups.length > 0 && <div className="followup-stack">
            {followups.map((item) => <article className="followup-card" key={item.id}>
              <span>上次留下的小物件</span><p>{item.action.text}</p><small>不用交作业，只选最接近现在的状态。</small>
              <div>{followupOutcomeOptions.map((option) => <button
                className={option.state === "completed" ? "" : "ghost"}
                key={option.state}
                onClick={() => api.labelFollowupOutcome(item.id, option.state).then(() => {
                  setFollowups((all) => all.filter((entry) => entry.id !== item.id));
                  setOperationNotice(option.notice);
                }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "回访状态更新失败"))}
              >{option.label}</button>)}</div>
            </article>)}
          </div>}

          <div className="messages" aria-live="polite">
            {carriedOuterItem && <article className="carried-outer-item" aria-label="从外圈带回的公共内容">
              <header><span>从万象廊带回</span><button type="button" onClick={() => setCarriedOuterItem(null)} aria-label="收起带回的内容">×</button></header>
              <strong>{carriedOuterItem.item.title}</strong>
              <p>{carriedOuterItem.item.summary}</p>
              <small>{carriedOuterItem.target === "bird_courier" ? "暂存给飞儿 · 未写入兴趣" : `准备和${agentUiRegistry[carriedOuterItem.target].name}聊聊 · 尚未发送`}</small>
              <div>
                <button type="button" onClick={() => setInput(`我想聊聊这条公开内容：${carriedOuterItem.item.title}。`)}>放进输入框</button>
                <button type="button" className="ghost" onClick={() => setCarriedOuterItem(null)}>先放下</button>
              </div>
            </article>}
            {messages.length === 0 && <div className="empty-state"><p>{activeAgent.emptyTitle}</p><span>{activeAgent.emptyBody}</span></div>}
            {messages.map((message) => {
              const messageAgentId = message.agentId ?? "zen_deer";
              const messageAgent = agentUiRegistry[messageAgentId];
              return <article key={message.id} className={`message message-${message.role}`}><span>{message.role === "assistant" ? messageAgent.name : "你"}</span><p>{message.content}</p>{message.role === "assistant" && runtime?.audioV1Enabled && <button className="voice-replay" onClick={() => audio.replay({ id: `replay-${message.id}`, text: message.content, agentId: messageAgentId, profileId: messageVoiceProfiles[message.id] ?? defaultVoiceProfileByAgent[messageAgentId] })} aria-label={`重播这条${messageAgent.name}回复`}>↻ 语音</button>}</article>;
            })}
            {busy && <article className="message message-assistant thinking"><span>{activeAgent.name}</span><p><i /><i /><i /></p></article>}
            {activeAction && <ActionCard action={activeAction} onConfirm={async (text) => { await api.confirmAction(activeAction.id, "confirm", text); refreshAction(activeAction.id, { text, status: "confirmed" }); }} onAbandon={async () => { await api.confirmAction(activeAction.id, "abandon"); refreshAction(activeAction.id, { status: "deleted" }); }} onUpdate={async (status) => { await api.updateAction(activeAction.id, status); refreshAction(activeAction.id, { status }); }} onFollowup={async () => { const due = new Date(Date.now() + 24 * 60 * 60 * 1000); await api.createFollowup(activeAction.id, due.toISOString()); }} />}
            {lastSafetyTurn && <button className="research-help" onClick={() => api.requestHelp(lastSafetyTurn).then((result) => setError(`已记录请求：${result.contact}`))}>请现场研究人员过来</button>}
            {messages.some((message) => message.role === "assistant") && <button className="end-chat-entry" onClick={() => void openHealingEnd()}>结束本次聊天</button>}
            <div ref={endRef} />
          </div>

          {sceneWorldEnabled && runtime?.emotionDiagnosticsAvailable && characterDiagnostics && <section className="world-diagnostics-summary" aria-label="场景与角色诊断">
            <strong>角色路由：{characterDiagnostics.activeSpirit}</strong>
            <span>{characterDiagnostics.transitionStyle} · 锁定 {characterDiagnostics.lockTurnsRemaining} 轮</span>
            <small>{characterDiagnostics.reasonCodes.join("、")} · {rendererState}</small>
          </section>}

          {error && <p className="inline-error" role="alert">{error}</p>}
          {operationNotice && <p className="operation-notice" role="status" aria-live="polite">{operationNotice}</p>}
          <form className="composer" onSubmit={send}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={composerPlaceholder} rows={2} maxLength={6000} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
            <VoiceInputButton
              disabled={busy}
              onStart={() => {
                speechInputBaseRef.current = input.trim();
                speechInputPolicyRef.current = audio.soundscapePolicy;
                audio.cancelSpeech();
                audio.applySoundscapePolicy("reduced");
                setOperationNotice("正在听；按住说话，松开后会直接发送");
              }}
              onPreview={(text) => setInput([speechInputBaseRef.current, text].filter(Boolean).join(speechInputBaseRef.current ? " " : ""))}
              onCommit={async (text) => {
                const combined = [speechInputBaseRef.current, text].filter(Boolean).join(speechInputBaseRef.current ? " " : "");
                audio.applySoundscapePolicy(speechInputPolicyRef.current);
                await sendText(combined);
              }}
              onCancel={() => {
                audio.applySoundscapePolicy(speechInputPolicyRef.current);
                setInput(speechInputBaseRef.current);
              }}
              onNotice={setOperationNotice}
            />
            <button disabled={busy || !input.trim()} aria-label="发送消息">↑</button>
          </form>
          <p className="composer-note">按住麦克风说话，松开后识别文字会直接发送。识别由当前浏览器提供，可能使用其在线语音服务；也可以随时改用文字输入。</p>
        </section>}
      </section>}

      {outerState.phase === "boundary" && <div className="modal-backdrop outer-boundary-backdrop" role="presentation" onMouseDown={() => dispatchOuter({ type: "return" })}><section className="settings-modal outer-boundary-modal" role="dialog" aria-modal="true" aria-labelledby="outer-boundary-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={() => dispatchOuter({ type: "return" })} aria-label="留在船上">×</button>
        <p className="eyebrow">跨出私密边界之前</p>
        <h2 id="outer-boundary-title">船上是你的内圈，门廊外是公共世界</h2>
        <div className="outer-boundary-map" aria-hidden="true"><span>你与 Agent 小队</span><i /><span>公开内容</span></div>
        <ul>
          <li><strong>内圈：</strong>船上的对话和记忆仍留在私密空间。</li>
          <li><strong>外圈：</strong>首版只展示预先编辑的演示内容，不读取你的私密对话。</li>
          <li><strong>你的控制：</strong>可以随时返回；浏览不等于报名、加入或留下兴趣。</li>
        </ul>
        <button type="button" className="primary-button" onClick={confirmOuterBoundary}>明白，去外圈看看</button>
        <button type="button" className="secondary-button" onClick={() => dispatchOuter({ type: "return" })}>这次留在船上</button>
      </section></div>}

      {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => { setSettingsOpen(false); settingsButtonRef.current?.focus(); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={(event) => { if (event.key === "Escape") { setSettingsOpen(false); settingsButtonRef.current?.focus(); } }} onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" autoFocus onClick={() => { setSettingsOpen(false); settingsButtonRef.current?.focus(); }} aria-label="关闭设置">×</button>
        <p className="eyebrow">数据与边界</p><h2 id="settings-title">你的控制权</h2>
        <dl><div><dt>匿名研究编号</dt><dd>{bootstrap.researchId}</dd></div><div><dt>本地保存</dt><dd>对话及系统自动提取的可能重要信息，最长 30 天</dd></div><div><dt>云端处理</dt><dd>对话会发送给模型供应商；本地删除不控制其日志。</dd></div><div><dt>反馈、申诉或求助</dt><dd>{bootstrap.researchContact}</dd></div></dl>
        <label className="setting-toggle"><input type="checkbox" checked={deepInterpretationEnabled} onChange={async (event) => { const enabled = event.target.checked; setDeepInterpretationEnabled(enabled); try { await api.updateExperiencePreferences({ deepInterpretationEnabled: enabled }); } catch (reason) { setDeepInterpretationEnabled(!enabled); setError(reason instanceof Error ? reason.message : "设置没有保存"); } }} /><span>允许鹿禅主动提出深入理解</span></label>
        <p className="settings-footnote">关闭后，鹿禅仍会回应和提供现实支持，但不会主动分析心理意义；你也可以直接说“别分析”。</p>
        {runtime?.memoryV2Enabled && <section className="memory-settings-entry" aria-labelledby="memory-settings-title">
          <div><h3 id="memory-settings-title">鹿禅记得的我</h3><p>查看鹿禅留下的事实、经历和关系推测，并随时纠正或删除。</p></div>
          <button className="secondary-button" onClick={() => { setSettingsOpen(false); setMemoryCenterOpen(true); }}>查看和管理记忆</button>
        </section>}
        <section className="memory-settings-entry" aria-labelledby="outer-settings-title">
          <div><h3 id="outer-settings-title">内圈与外圈</h3><p>重新查看公开世界与私密船上世界之间的边界说明。</p></div>
          <button className="secondary-button" onClick={() => { setSettingsOpen(false); dispatchOuter({ type: "review_boundary" }); }}>查看外圈边界</button>
        </section>
        {runtime?.audioV1Enabled && <section className="audio-settings" aria-labelledby="audio-settings-title">
          <h3 id="audio-settings-title">声音</h3>
          <label className="setting-toggle"><input type="checkbox" checked={audio.settings.masterEnabled} onChange={(event) => audio.updateSettings({ ...audio.settings, masterEnabled: event.target.checked })} /><span>声音总开关</span></label>
          <label className="setting-toggle"><input type="checkbox" checked={audio.settings.voiceEnabled} onChange={(event) => audio.updateSettings({ ...audio.settings, voiceEnabled: event.target.checked })} /><span>Agent 回复语音</span></label>
          <label className="setting-toggle"><input type="checkbox" checked={audio.settings.bgmEnabled} onChange={(event) => audio.updateSettings({ ...audio.settings, bgmEnabled: event.target.checked })} /><span>场景背景音乐</span></label>
          <label className="setting-toggle"><input type="checkbox" checked={audio.settings.sfxEnabled} onChange={(event) => audio.updateSettings({ ...audio.settings, sfxEnabled: event.target.checked })} /><span>场景互动音效</span></label>
          <label className="volume-setting"><span>总音量</span><input aria-label="总音量" type="range" min="0" max="1" step="0.05" value={audio.settings.masterVolume} onChange={(event) => audio.updateSettings({ ...audio.settings, masterVolume: Number(event.target.value) })} /></label>
          <label className="volume-setting"><span>语音音量</span><input aria-label="语音音量" type="range" min="0" max="1" step="0.05" value={audio.settings.voiceVolume} onChange={(event) => audio.updateSettings({ ...audio.settings, voiceVolume: Number(event.target.value) })} /></label>
          <label className="volume-setting"><span>背景音乐</span><input aria-label="背景音乐音量" type="range" min="0" max="1" step="0.05" value={audio.settings.bgmVolume} onChange={(event) => audio.updateSettings({ ...audio.settings, bgmVolume: Number(event.target.value) })} /></label>
          <label className="volume-setting"><span>互动音效</span><input aria-label="互动音效音量" type="range" min="0" max="1" step="0.05" value={audio.settings.sfxVolume} onChange={(event) => audio.updateSettings({ ...audio.settings, sfxVolume: Number(event.target.value) })} /></label>
          <p className="settings-footnote">进入体验时声音默认开启。你可以随时静音，或分别关闭回复语音、背景音乐和互动音效。</p>
          <p className="settings-footnote">当前角色音色：{activeAgentId === "zen_deer" ? runtime.cloudTtsEnabled ? "鹿禅 · 云健沉稳男声（云端）" : "鹿禅 · 优先中文低沉男声" : activeAgentId === "spirit_otter" ? "tata · 温暖柔和女声" : "飞儿 · 清晰利落女声"}。实际声音取决于当前设备可用声线。</p>
          {!audio.speechSupported && <p className="settings-footnote" role="status">当前浏览器没有可用的系统语音，文字、背景音乐和音效仍可使用。</p>}
        </section>}
        <button className="secondary-button" onClick={() => void api.exportMe()}>导出我的数据</button>
        <button className="secondary-button" onClick={async () => { await api.logout(); window.location.reload(); }}>退出本次会话</button>
        <button className="danger-button" onClick={async () => { if (window.confirm("确定永久删除本地全部对话、记忆、行动和回访吗？")) { await api.deleteMe(); window.location.reload(); } }}>永久删除本地数据</button>
        <p className="settings-footnote">本产品不是医疗或心理诊断服务。你可以随时关闭页面，不需要向角色解释。</p>
      </section></div>}
      {healingEndOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setHealingEndOpen(false)}><section className="settings-modal healing-end-modal" role="dialog" aria-modal="true" aria-labelledby="healing-end-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setHealingEndOpen(false)} aria-label="继续聊天">×</button>
        <p className="eyebrow">可选反馈</p><h2 id="healing-end-title">这次聊天对你有帮助吗？</h2>
        <div className="conversation-verdict-row" role="group" aria-label="这次聊天是否有帮助">
          <button type="button" aria-pressed={feedbackVerdict === 'helpful'} onClick={() => setFeedbackVerdict('helpful')}><span aria-hidden="true">👍</span> 有帮助</button>
          <button type="button" aria-pressed={feedbackVerdict === 'not_helpful'} onClick={() => setFeedbackVerdict('not_helpful')}><span aria-hidden="true">👎</span> 没帮到</button>
        </div>
        {feedbackVerdict && <section className={`feedback-details feedback-details-${feedbackVerdict}`} aria-label="可选详细反馈">
          <p>如果愿意，可以再告诉我们一点；这些都可以不选。</p>
          <fieldset><legend>是否说到真正难受的地方</legend><div className="healing-choice-row">{([['hit','说到了'],['partly','说到一部分'],['missed','没有说到']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={healingUnderstanding === value} onClick={() => setHealingUnderstanding(value)}>{label}</button>)}</div></fieldset>
          <fieldset><legend>此刻更接近哪一种变化</legend><div className="healing-choice-row">{([['more_space','松了一点'],['clearer','更清楚'],['more_choice','多一点选择'],['unchanged','没有变化'],['worse','更难受']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={healingMovement === value} onClick={() => setHealingMovement(value)}>{label}</button>)}</div></fieldset>
          {(feedbackVerdict === 'not_helpful' || healingUnderstanding === 'missed' || healingMovement === 'unchanged' || healingMovement === 'worse') && <fieldset><legend>哪里出了问题</legend><div className="healing-choice-row">{([['too_shallow','太浅'],['repetitive','一直重复'],['too_analytical','分析太多'],['too_generic','太泛'],['unwanted_advice','不想要建议'],['misread','理解错了'],['topic_irrelevant','话题和我无关'],['topic_not_switched','没有真正换题'],['other','其他']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={healingReason === value} onClick={() => setHealingReason(value)}>{label}</button>)}</div></fieldset>}
        </section>}
        <button className="primary-button" disabled={busy || !feedbackVerdict || !healingSegmentId} onClick={() => void finishHealingSession(false)}>提交并结束</button>
        <button className="secondary-button" disabled={busy} onClick={() => void finishHealingSession(true)}>跳过反馈并结束</button>
        <p className="settings-footnote">反馈只记录所选项目，不记录洞察或核心痛点分类。结束后仍可继续开始一段新的聊天。</p>
      </section></div>}
      {memoryCenterOpen && <MemoryCenter onClose={() => { setMemoryCenterOpen(false); settingsButtonRef.current?.focus(); }} />}
    </main>
  );
}
