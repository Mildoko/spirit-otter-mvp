import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { BrowserSpeechInputAdapter, type SpeechInputStatus } from "../speech/speech-input";

type VoiceUiStatus = "idle" | "listening" | "transcribing" | "sending" | "error";

export function VoiceInputButton(props: {
  disabled?: boolean;
  onStart(): void;
  onPreview(text: string): void;
  onCommit(text: string): Promise<void> | void;
  onCancel(): void;
  onNotice(message: string): void;
}) {
  const [adapter] = useState(() => new BrowserSpeechInputAdapter());
  const [status, setStatus] = useState<VoiceUiStatus>("idle");
  const holdingRef = useRef(false);
  const releasedRef = useRef(false);
  const failedRef = useRef(false);
  const completedTextRef = useRef("");
  const suppressClickRef = useRef(false);

  useEffect(() => () => adapter.cancel(), [adapter]);

  const commit = async (text: string) => {
    const normalized = text.trim();
    if (!normalized || failedRef.current) return;
    completedTextRef.current = "";
    setStatus("sending");
    props.onNotice("语音已识别，正在发送");
    try { await props.onCommit(normalized); }
    finally { setStatus("idle"); }
  };

  const handleAdapterStatus = (next: SpeechInputStatus, message?: string) => {
    if (next === "listening") setStatus("listening");
    if (next === "unsupported" || next === "permission_denied" || next === "error") {
      failedRef.current = true;
      holdingRef.current = false;
      releasedRef.current = true;
      setStatus("error");
      props.onCancel();
    }
    if (message) props.onNotice(message);
  };

  const begin = () => {
    if (props.disabled || holdingRef.current || status === "sending") return;
    holdingRef.current = true;
    releasedRef.current = false;
    failedRef.current = false;
    completedTextRef.current = "";
    props.onStart();
    const started = adapter.start({
      onTranscript: props.onPreview,
      onComplete: (text) => {
        completedTextRef.current = text;
        if (releasedRef.current) void commit(text);
      },
      onStatus: handleAdapterStatus,
    });
    if (!started) holdingRef.current = false;
  };

  const finish = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    releasedRef.current = true;
    if (failedRef.current) return;
    setStatus("transcribing");
    props.onNotice("正在识别，完成后会直接发送");
    const completed = completedTextRef.current;
    if (completed) void commit(completed);
    else adapter.stop();
  };

  const cancel = () => {
    if (!holdingRef.current && status !== "transcribing") return;
    holdingRef.current = false;
    releasedRef.current = true;
    failedRef.current = true;
    completedTextRef.current = "";
    adapter.cancel();
    setStatus("idle");
    props.onCancel();
    props.onNotice("已取消这次语音输入");
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || props.disabled) return;
    event.preventDefault();
    suppressClickRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    begin();
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finish();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      begin();
    }
    if (event.key === "Escape") cancel();
  };

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      finish();
    }
  };

  const label = status === "listening"
    ? "松开发送语音"
    : status === "transcribing"
      ? "正在识别语音"
      : status === "sending"
        ? "正在发送语音"
        : "按住麦克风说话";

  return <button
    type="button"
    className={`voice-input voice-input-${status}`}
    disabled={props.disabled || status === "transcribing" || status === "sending"}
    onPointerDown={onPointerDown}
    onPointerUp={onPointerUp}
    onPointerCancel={cancel}
    onKeyDown={onKeyDown}
    onKeyUp={onKeyUp}
    onClick={(event) => {
      if (suppressClickRef.current) { suppressClickRef.current = false; return; }
      if (holdingRef.current) finish(); else begin();
      event.preventDefault();
    }}
    onContextMenu={(event) => event.preventDefault()}
    aria-label={label}
    aria-pressed={status === "listening"}
    title={label}
  >
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M8.5 21h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  </button>;
}
