import { useState } from "react";

interface Props {
  action: { id: string; text: string; status: string };
  onConfirm: (text: string) => Promise<void>;
  onAbandon: () => Promise<void>;
  onUpdate: (status: "completed" | "deferred" | "deleted") => Promise<void>;
  onFollowup: () => Promise<void>;
}

export function ActionCard({ action, onConfirm, onAbandon, onUpdate, onFollowup }: Props) {
  const [text, setText] = useState(action.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await task(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作没有完成，请重试"); } finally { setBusy(false); }
  };
  if (action.status === "deleted") return null;
  return (
    <article className="action-card">
      <p className="card-kicker">捞起的一件事</p>
      {action.status === "draft" ? (
        <>
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={240} aria-label="编辑行动" />
          <div className="card-actions">
            <button disabled={busy} onClick={() => run(() => onConfirm(text))}>确认这一小步</button>
            <button className="ghost" disabled={busy} onClick={() => run(onAbandon)}>先不做</button>
          </div>
        </>
      ) : (
        <>
          <p className={action.status === "completed" ? "action-done" : ""}>{action.text}</p>
          <div className="card-actions">
            {action.status !== "completed" && <button disabled={busy} onClick={() => run(() => onUpdate("completed"))}>已完成</button>}
            {action.status === "confirmed" && <button className="ghost" disabled={busy} onClick={() => run(onFollowup)}>下次回来提醒</button>}
            <button className="text-button" disabled={busy} onClick={() => run(() => onUpdate("deleted"))}>删除</button>
          </div>
        </>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </article>
  );
}
