import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { VisualActionV1 } from "@otter/shared";
import ripplesUrl from "../assets/scene-world-v1/layer-ripples-v1.png";
import backgroundUrl from "../assets/scene-world-v1/background-clean-v1.png";
import boatUserUrl from "../assets/scene-world-v1/layer-boat-user-transparent-v2.png";
import deerUrl from "../assets/spirit-deer-zen-v1.png";
import otterUrl from "../assets/scene-world-v1/layer-otter-v1.png";
import type { TataExpressionCueV1 } from "../lib/otter-expression";

export type WorldView = "horizon" | "sky";
export type RendererState = "loading" | "ready" | "fallback" | "context_lost";
export type SceneQuality = "high" | "balanced" | "low" | "static";

interface SceneWorldProps {
  action: VisualActionV1;
  view: WorldView;
  onViewChange: (view: WorldView) => void;
  onSpiritActivate: () => void;
  onRendererState?: (state: RendererState) => void;
  showDiagnostics?: boolean;
  expressionCue: TataExpressionCueV1;
  welcomeText?: string;
  welcomeTimeLabel?: string;
  dialogOpen?: boolean;
}

const designWidth = 1672;
const designHeight = 941;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法载入场景资源：${url}`));
    image.src = url;
  });
}

function chooseQuality(reducedMotion: boolean): SceneQuality {
  if (reducedMotion || window.innerWidth < 600) return "low";
  if (window.innerWidth < 1000 || window.devicePixelRatio > 2) return "balanced";
  return "high";
}

export function SceneWorld({ action, view, onViewChange, onSpiritActivate, onRendererState, showDiagnostics = false, expressionCue, welcomeText, welcomeTimeLabel, dialogOpen = false }: SceneWorldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef(action);
  const viewRef = useRef(view);
  const activateRef = useRef(onSpiritActivate);
  const rendererCallbackRef = useRef(onRendererState);
  const [rendererState, setRendererState] = useState<RendererState>("loading");
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [fps, setFps] = useState(0);
  const quality = useMemo(() => chooseQuality(reducedMotion), [reducedMotion]);

  useEffect(() => { actionRef.current = action; }, [action]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { activateRef.current = onSpiritActivate; }, [onSpiritActivate]);
  useEffect(() => { rendererCallbackRef.current = onRendererState; }, [onRendererState]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let app: Application | null = null;
    let appInitialized = false;
    let appDestroyed = false;
    let frameCount = 0;
    let frameWindow = 0;
    let cleanup: (() => void) | undefined;

    const destroyApp = () => {
      if (!app || !appInitialized || appDestroyed) return;
      appDestroyed = true;
      cleanup?.();
      cleanup = undefined;
      app.destroy(true, { children: true, texture: true, textureSource: true });
      app = null;
    };

    const setStatus = (next: RendererState) => {
      if (disposed) return;
      setRendererState(next);
      rendererCallbackRef.current?.(next);
    };

    const initialize = async () => {
      if (!document.createElement("canvas").getContext("webgl2") && !document.createElement("canvas").getContext("webgl")) {
        setStatus("fallback");
        return;
      }
      try {
        app = new Application();
        await app.init({
          resizeTo: host,
          backgroundAlpha: 0,
          antialias: quality === "high",
          resolution: Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1.5),
          autoDensity: true,
          preference: "webgl",
          powerPreference: "high-performance",
        });
        appInitialized = true;
        if (disposed) { destroyApp(); return; }
        host.appendChild(app.canvas);
        app.canvas.className = "scene-world-canvas";

        const [backgroundTexture, rippleTexture, boatTexture, deerTexture, otterTexture] = await Promise.all([
          loadImage(backgroundUrl).then((image) => Texture.from(image)),
          loadImage(ripplesUrl).then((image) => Texture.from(image)),
          loadImage(boatUserUrl).then((image) => Texture.from(image)),
          loadImage(deerUrl).then((image) => Texture.from(image)),
          loadImage(otterUrl).then((image) => Texture.from(image)),
        ]);
        if (disposed || !app) return;

        const backgroundWorld = new Container();
        const world = new Container();
        const skyGlow = new Container();
        app.stage.addChild(backgroundWorld, world, skyGlow);

        const fullFrame = (texture: Texture) => {
          const sprite = new Sprite(texture);
          sprite.width = designWidth;
          sprite.height = designHeight;
          return sprite;
        };

        const background = fullFrame(backgroundTexture);
        const ripples = fullFrame(rippleTexture);
        const boatGroup = new Container();
        const boat = fullFrame(boatTexture);
        boatGroup.addChild(boat);
        boatGroup.scale.set(0.68);
        boatGroup.position.set(210, 260);

        const otterGroup = new Container();
        const otter = fullFrame(otterTexture);
        otterGroup.addChild(otter);
        otterGroup.scale.set(0.68);
        otterGroup.position.set(600, 264);

        const deer = new Sprite(deerTexture);
        deer.anchor.set(0.5);
        deer.width = 250;
        deer.height = 375;
        deer.position.set(600, 520);
        ripples.blendMode = "add";
        ripples.alpha = quality === "low" ? 0.12 : 0.24;
        const spiritAura = new Graphics().ellipse(0, 0, 118, 156).stroke({ color: 0xffe8b0, width: 1, alpha: 0.2 });
        spiritAura.position.set(600, 530);
        spiritAura.blendMode = "add";
        backgroundWorld.addChild(background);
        world.addChild(ripples, boatGroup, deer, otterGroup, spiritAura);

        const starCount = quality === "high" ? 70 : quality === "balanced" ? 36 : 16;
        for (let index = 0; index < starCount; index += 1) {
          const star = new Graphics().circle((index * 239) % designWidth, 24 + ((index * 137) % 540), 0.8 + (index % 3) * 0.45).fill({ color: 0xffe8b0, alpha: 0.2 + (index % 5) * 0.1 });
          skyGlow.addChild(star);
        }
        skyGlow.alpha = 0;

        const spiritHit = new Graphics().ellipse(600, 520, 145, 205).fill({ color: 0xffffff, alpha: 0.001 });
        spiritHit.eventMode = "static";
        spiritHit.cursor = "pointer";
        spiritHit.on("pointertap", () => activateRef.current());
        world.addChild(spiritHit);

        const fitWorld = () => {
          if (!app) return;
          const width = app.screen.width;
          const height = app.screen.height;
          const backgroundScale = Math.max(width / designWidth, height / designHeight);
          backgroundWorld.scale.set(backgroundScale);
          backgroundWorld.position.set((width - designWidth * backgroundScale) / 2, (height - designHeight * backgroundScale) / 2);
          const mobileLandscape = width > height && width <= 960 && height <= 520;
          const base = Math.min(width / designWidth, height / designHeight) * (mobileLandscape ? 1.04 : 1);
          const lookingUp = viewRef.current === "sky";
          const scale = base * (lookingUp && !reducedMotion && !mobileLandscape ? 1.22 : 1);
          const targetX = (width - designWidth * scale) / 2;
          const targetY = lookingUp && !reducedMotion && !mobileLandscape ? 0 : (height - designHeight * scale) / 2;
          world.scale.set(scale);
          world.position.set(targetX, targetY);
          skyGlow.scale.set(scale);
          skyGlow.position.set(targetX, targetY);
        };
        fitWorld();
        const resizeObserver = new ResizeObserver(fitWorld);
        resizeObserver.observe(host);

        const onContextLost = (event: Event) => { event.preventDefault(); setStatus("context_lost"); };
        const onContextRestored = () => setStatus("ready");
        app.canvas.addEventListener("webglcontextlost", onContextLost);
        app.canvas.addEventListener("webglcontextrestored", onContextRestored);

        let elapsed = 0;
        app.ticker.add((ticker) => {
          elapsed += ticker.deltaMS;
          frameCount += 1;
          frameWindow += ticker.deltaMS;
          if (frameWindow >= 1000) {
            setFps(Math.round((frameCount * 1000) / frameWindow));
            frameCount = 0;
            frameWindow = 0;
          }

          const lookingUp = viewRef.current === "sky";
          const targetSkyAlpha = lookingUp ? 0.9 : 0;
          skyGlow.alpha += (targetSkyAlpha - skyGlow.alpha) * Math.min(1, ticker.deltaMS / (reducedMotion ? 100 : 800));
          fitWorld();

          const currentAction = actionRef.current;
          const still = currentAction === "safety_still" || reducedMotion;
          const speed = currentAction === "think" ? 0.0014 : currentAction === "speak" ? 0.0022 : 0.0008;
          const amplitude = still ? 0 : currentAction === "invite" ? 7 : currentAction === "approach" ? 5 : 2.5;
          const pulse = Math.sin(elapsed * speed) * amplitude;
          spiritAura.scale.set(1 + pulse * 0.004);
          spiritAura.alpha = currentAction === "safety_still" ? 0 : currentAction === "notice" ? 0.56 : currentAction === "invite" ? 0.42 : 0.16;
          const rippleTarget = currentAction === "safety_still" ? 0 : currentAction === "invite" || currentAction === "speak" ? 0.4 : quality === "low" ? 0.1 : 0.2;
          ripples.alpha += (rippleTarget - ripples.alpha) * 0.05;
        });

        setStatus("ready");
        return () => {
          resizeObserver.disconnect();
          app?.canvas.removeEventListener("webglcontextlost", onContextLost);
          app?.canvas.removeEventListener("webglcontextrestored", onContextRestored);
        };
      } catch (reason) {
        console.error("SceneWorld initialization failed", reason);
        setStatus("fallback");
      }
    };

    void initialize().then((result) => {
      cleanup = result;
      if (disposed) destroyApp();
    });
    return () => {
      disposed = true;
      destroyApp();
    };
  }, [quality, reducedMotion]);

  return <section className={`scene-world quality-${quality} view-${view}`} aria-label="灵体水面世界">
    <div ref={hostRef} className="scene-world-host" aria-hidden="true" />
    {(rendererState === "fallback" || rendererState === "context_lost") && <div className="scene-world-fallback" role="img" aria-label="星空下安坐船尾的鹿灵鹿禅与灵体水面">
      <img className="scene-world-fallback-background" src={backgroundUrl} alt="" />
      <img className="scene-world-fallback-boat" src={boatUserUrl} alt="" />
      <img className="scene-world-fallback-otter" src={otterUrl} alt="" />
      <img className="scene-world-fallback-deer" src={deerUrl} alt="" />
    </div>}
    {!dialogOpen && <button className="scene-spirit-access" onFocus={() => { if (action === "idle") activateRef.current = onSpiritActivate; }} onClick={onSpiritActivate} aria-label="靠近鹿灵鹿禅并打开对话">与鹿禅说话</button>}
    <div className={`tata-expression tata-expression-${expressionCue.expression}`} role="img" aria-label={expressionCue.label}><span aria-hidden="true">{expressionCue.symbol}</span></div>
    {welcomeText && <aside className="tata-welcome-bubble" role="status"><strong>鹿禅</strong><p>{welcomeText}</p>{welcomeTimeLabel && <small>{welcomeTimeLabel}</small>}</aside>}
    <button className="scene-view-toggle" onClick={() => onViewChange(view === "horizon" ? "sky" : "horizon")} disabled={rendererState === "loading"}>
      {view === "horizon" ? "仰望星空" : "返回水面"}
    </button>
    {rendererState === "loading" && <div className="scene-loading" role="status">水面正在显现…</div>}
    {showDiagnostics && <output className="scene-diagnostics">{rendererState} · {quality} · {fps}fps · {action}</output>}
  </section>;
}
