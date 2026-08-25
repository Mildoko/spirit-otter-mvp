import { useState, type FormEvent } from "react";
import spiritDeerPng from "../assets/spirit-deer-zen-v1.png";

interface Props {
  onSubmit: (inviteCode: string) => Promise<void>;
  error: string | null;
  persistent: boolean;
  soundEnabled: boolean;
}

export function Onboarding({ onSubmit, error, persistent, soundEnabled }: Props) {
  const consents = [
    ["adult", "我确认自己已满 18 岁。"],
    ["ai", "我知道鹿禅是 AI 鹿灵体，不是真人、宗教导师、治疗师或医疗服务。"],
    ["cloud", "我同意对话内容发送给云端模型供应商处理；本地删除不等同于删除供应商日志。"],
    ["data", persistent
      ? "我同意为本次受控测试保存匿名对话、行为数据，以及系统自动提取的可能重要信息，用于后续对话，最长 30 天，并可随时导出或删除。"
      : "我知道本次体验数据只保存在当前服务的临时内存中，服务关闭后清空，也可随时导出或删除。"],
    ["deep", "我同意鹿禅在普通支持对话中，基于我当下说出的内容提出可反驳的深入理解；我可以随时说“别分析”或在设置中关闭。"],
  ] as const;
  const [inviteCode, setInviteCode] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const allChecked = consents.every(([key]) => checked[key]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!allChecked || !inviteCode.trim()) return;
    setBusy(true);
    try { await onSubmit(inviteCode.trim()); } finally { setBusy(false); }
  };

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card" aria-labelledby="welcome-title">
        <div className="brand-mark" aria-hidden="true">BZ</div>
        <img className="onboarding-spirit" src={spiritDeerPng} alt="安坐的鹿灵鹿禅预览" />
        <p className="eyebrow">{persistent ? "预约式现场体验" : "受控内部体验版"}</p>
        <h1 id="welcome-title">先在这里，慢一点。</h1>
        <p className="lead">鹿禅会先听你说，也会在你愿意时，用一句短话或一则禅门故事，陪你照见眼前的一件事。</p>
        <div className="boundary-note">
          <strong>使用边界</strong>
          <span>本产品不提供心理诊断或医疗建议。若存在立即危险，请直接联系现场研究人员或当地紧急服务。</span>
        </div>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="invite">{persistent ? "一次性邀请码" : "本次体验码"}</label>
          <input id="invite" aria-label={persistent ? "一次性邀请码" : "本次体验码"} className="invite-input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="off" placeholder="OTTER-••••••••••" />
          <fieldset className="consent-list">
            <legend>进入前请逐项确认</legend>
            {consents.map(([key, label]) => (
              <label key={key} className="consent-item">
                <input type="checkbox" checked={Boolean(checked[key])} onChange={(event) => setChecked((state) => ({ ...state, [key]: event.target.checked }))} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={!allChecked || !inviteCode.trim() || busy}>{busy ? "正在进入…" : soundEnabled ? "进入静水区并开启声音" : "进入静水区"}</button>
        </form>
      </section>
    </main>
  );
}
