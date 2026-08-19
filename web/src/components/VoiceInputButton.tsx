import { useRef, useState } from "react";
import { BrowserSpeechInputAdapter, type SpeechInputStatus } from "../speech/speech-input";

export function VoiceInputButton(props: {
  disabled?: boolean;
  onStart(): void;
  onTranscript(text: string): void;
  onFinish(): void;
  onNotice(message: string): void;
}) {
  const [adapter] = useState(() => new BrowserSpeechInputAdapter());
  const [status, setStatus] = useState<SpeechInputStatus>(() => adapter.isSupported() ? "idle" : "unsupported");
  const finishedRef = useRef(false);

  const updateStatus = (next: SpeechInputStatus, message?: string) => {
    setStatus(next);
    if (message) props.onNotice(message);
    if (next === "idle" && !finishedRef.current) {
      finishedRef.current = true;
      props.onFinish();
    }
  };

  const toggle = () => {
    if (status === "listening") { adapter.stop(); return; }
    finishedRef.current = false;
    props.onStart();
    adapter.start({ onTranscript: props.onTranscript, onStatus: updateStatus });
  };

  return <button
    type="button"
    className={`voice-input voice-input-${status}`}
    disabled={props.disabled || status === "unsupported"}
    onClick={toggle}
    aria-label={status === "listening" ? "结束语音输入" : "开始语音输入"}
    aria-pressed={status === "listening"}
    title={status === "unsupported" ? "当前浏览器不支持语音输入" : undefined}
  >
    <span aria-hidden="true">{status === "listening" ? "■" : "●"}</span>
    {status === "listening" ? "正在听" : "说话"}
  </button>;
}
