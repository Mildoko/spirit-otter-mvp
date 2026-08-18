import { useEffect, useState } from "react";
import type { EmotionCorrectionLabelV1, EmotionLabelV1, PublicEmotionInterpretation } from "@otter/shared";

const labels: Array<{ label: EmotionLabelV1; name: string }> = [
  { label: "joy", name: "喜悦" }, { label: "relief", name: "释然" }, { label: "hope", name: "希望" },
  { label: "interest", name: "兴趣" }, { label: "gratitude", name: "感激" }, { label: "sadness", name: "悲伤" },
  { label: "anger", name: "愤怒" }, { label: "anxiety", name: "焦虑/恐惧" }, { label: "frustration", name: "挫败" },
  { label: "disappointment", name: "失望" }, { label: "disgust", name: "厌恶" }, { label: "shame", name: "羞耻" },
  { label: "guilt", name: "内疚" }, { label: "loneliness", name: "孤独" }, { label: "surprise", name: "惊讶" },
];
const intensityNames = ["", "很弱", "偏弱", "中等", "较强", "很强"];

export function EmotionInterpretationCard(props: {
  turnId: string;
  interpretation: PublicEmotionInterpretation;
  onCorrect: (verdict: "accurate" | "replace" | "unknown" | "neutral", labels?: EmotionCorrectionLabelV1[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<EmotionCorrectionLabelV1[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setSelected([]);
    setError(null);
  }, [props.turnId]);

  const submit = async (verdict: "accurate" | "replace" | "unknown" | "neutral", values: EmotionCorrectionLabelV1[] = []) => {
    setBusy(true);
    setError(null);
    try {
      await props.onCorrect(verdict, values);
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "纠正没有保存，请重试");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (label: EmotionLabelV1) => {
    setSelected((current) => current.some((item) => item.label === label)
      ? current.filter((item) => item.label !== label)
      : current.length >= 2 ? current : [...current, { label, intensityLevel: 3 }]);
  };

  const summary = props.interpretation.status === "unknown"
    ? "暂时还没读清"
    : props.interpretation.status === "neutral"
      ? "暂未读到明显情绪"
      : props.interpretation.labels.map((item) => `${item.displayName} · ${intensityNames[item.intensityLevel]}`).join("  ＋  ");

  return <section className="emotion-interpretation" aria-label="水獭的情绪推测">
    <div className="emotion-interpretation-head">
      <span>{props.interpretation.status === "user_corrected" ? "已按你的纠正" : "水獭的猜测"}</span>
      <strong>{summary}</strong>
    </div>
    <p>{props.interpretation.disclaimer}</p>
    {!editing && props.interpretation.canCorrect && <div className="emotion-verdict-actions">
      <button disabled={busy} onClick={() => void submit("accurate")}>准确</button>
      <button className="ghost" disabled={busy} onClick={() => setEditing(true)}>不准确</button>
    </div>}
    {editing && <div className="emotion-correction-editor">
      <p>选一个或两个更接近的词，也可以直接说暂不明确。</p>
      <div className="emotion-label-grid">
        {labels.map((item) => <button type="button" key={item.label} aria-pressed={selected.some((entry) => entry.label === item.label)} onClick={() => toggle(item.label)}>{item.name}</button>)}
      </div>
      {selected.map((item) => <label className="emotion-intensity" key={item.label}>
        <span>{labels.find((entry) => entry.label === item.label)?.name}的强度</span>
        <select value={item.intensityLevel} onChange={(event) => setSelected((current) => current.map((entry) => entry.label === item.label ? { ...entry, intensityLevel: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 } : entry))}>
          {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{intensityNames[value]}</option>)}
        </select>
      </label>)}
      <div className="emotion-correction-actions">
        <button disabled={busy || selected.length === 0} onClick={() => void submit("replace", selected)}>采用这些词</button>
        <button className="ghost" disabled={busy} onClick={() => void submit("unknown")}>暂不明确</button>
        <button className="ghost" disabled={busy} onClick={() => void submit("neutral")}>没有明显情绪</button>
        <button className="ghost" disabled={busy} onClick={() => setEditing(false)}>取消</button>
      </div>
    </div>}
    {error && <small className="inline-error" role="alert">{error}</small>}
  </section>;
}
