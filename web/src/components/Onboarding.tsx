import { useState, type FormEvent } from "react";

interface Props {
  onSubmit: (inviteCode: string) => Promise<void>;
  error: string | null;
}

const consents = [
  ["adult", "我确认自己已满 18 岁。"],
  ["ai", "我知道水獭是 AI，不是真人、治疗师或医疗服务。"],
  ["cloud", "我同意对话内容发送给云端模型供应商处理；本地删除不等同于删除供应商日志。"],
  ["data", "我同意为本次受控测试保存匿名对话和行为数据，最长 30 天，并可随时导出或删除。"],
] as const;

export function Onboarding({ onSubmit, error }: Props) {
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
        <div className="brand-mark" aria-hidden="true">浮</div>
        <p className="eyebrow">预约式现场体验</p>
        <h1 id="welcome-title">先在这里，慢一点。</h1>
        <p className="lead">灵体水獭会先听你说，也可以在你愿意时，陪你只捞起眼前的一件事。</p>
        <div className="boundary-note">
          <strong>使用边界</strong>
          <span>本产品不提供心理诊断或医疗建议。若存在立即危险，请直接联系现场研究人员或当地紧急服务。</span>
        </div>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="invite">一次性邀请码</label>
          <input id="invite" className="invite-input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="off" placeholder="OTTER-••••••••••" />
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
          <button className="primary-button" disabled={!allChecked || !inviteCode.trim() || busy}>{busy ? "正在进入…" : "进入静水区"}</button>
        </form>
      </section>
    </main>
  );
}
