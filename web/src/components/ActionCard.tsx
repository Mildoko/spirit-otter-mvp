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
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (task: () => Promise<void>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try { await task(); setNotice(success); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作没有完成，请重试"); } finally { setBusy(false); }
  };
  if (action.status === "deleted") return null;
  return (
    <article className="action-card">
      <p className="card-kicker">捞起的一件事</p>
      {action.status === "draft" ? (
        <>
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={240} aria-label="编辑行动" />
          <div className="card-actions">
            <button disabled={busy} onClick={() => run(() => onConfirm(text), "行动已确认")}>确认这一小步</button>
            <button className="ghost" disabled={busy} onClick={() => run(onAbandon, "已放下这项行动")}>先不做</button>
          </div>
        </>
      ) : (
        <>
          <p className={action.status === "completed" ? "action-done" : ""}>{action.text}</p>
          <div className="card-actions">
            {action.status !== "completed" && <button disabled={busy} onClick={() => run(() => onUpdate("completed"), "已标记完成")}>已完成</button>}
            {action.status === "confirmed" && <button className="ghost" disabled={busy} onClick={() => run(onFollowup, "已创建下次回访")}>下次回来提醒</button>}
            <button className="text-button" disabled={busy} onClick={() => run(() => onUpdate("deleted"), "行动已删除")}>删除</button>
          </div>
        </>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="operation-notice" role="status">{notice}</p>}
    </article>
  );
}
