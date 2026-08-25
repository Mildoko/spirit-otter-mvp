import { useEffect, useMemo, useState } from "react";
import type { MemoryStatus, PublicMemoryRelationV1, PublicMemoryV2 } from "@otter/shared";
import { api } from "../lib/api";

const kindLabels: Record<PublicMemoryV2["kind"], string> = {
  user_fact: "关于你",
  user_preference: "相处偏好",
  boundary: "你的边界",
  episode: "近期经历",
  relationship_milestone: "重要关系与时刻",
  support_strategy: "对你有帮助的方式",
};
const claimLabels = { asserted: "你说过", hypothesis: "鹿禅的推测", confirmed: "你已确认" } as const;
const relationLabels: Record<PublicMemoryRelationV1["type"], string> = {
  involves: "涉及", may_trigger: "可能触发", supports: "支持", contradicts: "与之矛盾",
  updates: "更新了", related_to: "与之有关", part_of: "属于",
};
type Filter = "all" | Extract<MemoryStatus, "active" | "disabled" | "rejected" | "superseded" | "expired">;

export function MemoryCenter({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<PublicMemoryV2[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PublicMemoryV2 | null>(null);
  const [draft, setDraft] = useState("");

  const load = async () => {
    setLoading(true); setError(null);
    try { setItems((await api.memories(filter === "all" ? undefined : filter)).items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取记忆"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [filter]);

  const grouped = useMemo(() => Object.entries(kindLabels).map(([kind, label]) => ({
    kind, label, items: items.filter((memory) => memory.kind === kind),
  })).filter((group) => group.items.length), [items]);

  const decide = async (memory: PublicMemoryV2, action: "confirm" | "disable" | "enable" | "reject") => {
    setBusyId(memory.id); setError(null);
    try { await api.decideMemory(memory.id, { action }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作没有完成"); }
    finally { setBusyId(null); }
  };
  const saveCorrection = async () => {
    if (!editing || draft.trim().length < 3) return;
    setBusyId(editing.id);
    try { await api.decideMemory(editing.id, { action: "correct", content: draft.trim() }); setEditing(null); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "纠正没有保存"); }
    finally { setBusyId(null); }
  };
  const remove = async (memory: PublicMemoryV2) => {
    if (!window.confirm("确定删除这条记忆吗？删除后鹿禅不会再使用它。")) return;
    setBusyId(memory.id);
    try { await api.deleteMemory(memory.id); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "删除没有完成"); }
    finally { setBusyId(null); }
  };
  const decideRelation = async (relation: PublicMemoryRelationV1, action: "confirm" | "disable" | "enable" | "reject") => {
    setBusyId(relation.id);
    try { await api.decideMemoryRelation(relation.id, { action }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "关系操作没有完成"); }
    finally { setBusyId(null); }
  };
  const removeRelation = async (relation: PublicMemoryRelationV1) => {
    if (!window.confirm("确定删除这条关系吗？")) return;
    setBusyId(relation.id);
    try { await api.deleteMemoryRelation(relation.id); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "关系删除没有完成"); }
    finally { setBusyId(null); }
  };

  return <div className="memory-center-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="memory-center" role="dialog" aria-modal="true" aria-labelledby="memory-center-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <header className="memory-center-head">
        <div><p className="eyebrow">你的控制权</p><h2 id="memory-center-title">鹿禅记得的我</h2><p>这些内容只用于让对话保持连续。推测不等于事实，你可以随时确认、纠正、停用或删除。</p></div>
        <button autoFocus className="modal-close" onClick={onClose} aria-label="关闭记忆页面">×</button>
      </header>
      <nav className="memory-filters" aria-label="筛选记忆">
        {([['all', '全部'], ['active', '正在使用'], ['disabled', '已停用'], ['rejected', '不准确'], ['superseded', '已更新']] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </nav>
      {error && <p className="memory-error" role="alert">{error}</p>}
      <div className="memory-center-body">
        {loading && <p className="memory-empty" role="status">正在整理记忆…</p>}
        {!loading && !items.length && <div className="memory-empty"><strong>这里还没有记忆</strong><p>当你明确说出重要偏好、边界或经历时，鹿禅才可能把它留下。</p></div>}
        {grouped.map((group) => <section className="memory-group" key={group.kind} aria-labelledby={`memory-group-${group.kind}`}>
          <h3 id={`memory-group-${group.kind}`}>{group.label}</h3>
          {group.items.map((memory) => <article className={`memory-card memory-claim-${memory.claimState}`} key={memory.id}>
            <div className="memory-card-head"><span>{claimLabels[memory.claimState]}</span><time dateTime={memory.eventAt ?? memory.observedAt}>{new Date(memory.eventAt ?? memory.observedAt).toLocaleDateString("zh-CN")}</time></div>
            <p>{memory.content}</p>
            {memory.evidence[0] && <blockquote>来源：“{memory.evidence[0].excerpt}”</blockquote>}
            {memory.relations.filter((relation, index, all) => all.findIndex((item) => item.id === relation.id) === index).map((relation) => <div className={`memory-relation relation-${relation.claimState}`} key={relation.id}>
              <span>{relation.claimState === "hypothesis" ? "待确认关系" : "关联"}</span>
              <p>{relation.sourceContent} <strong>{relationLabels[relation.type]}</strong> {relation.targetContent}</p>
              <div>{relation.claimState === "hypothesis" && relation.status === "active" && <><button disabled={busyId === relation.id} onClick={() => void decideRelation(relation, "confirm")}>确认关系</button><button disabled={busyId === relation.id} onClick={() => void decideRelation(relation, "reject")}>不准确</button></>}{relation.status === "active" && relation.claimState !== "hypothesis" && <button disabled={busyId === relation.id} onClick={() => void decideRelation(relation, "disable")}>停用关系</button>}{relation.status === "disabled" && <button disabled={busyId === relation.id} onClick={() => void decideRelation(relation, "enable")}>恢复关系</button>}<button disabled={busyId === relation.id} onClick={() => void removeRelation(relation)}>删除关系</button></div>
            </div>)}
            <div className="memory-actions">
              {memory.claimState === "hypothesis" && memory.status === "active" && <button disabled={busyId === memory.id} onClick={() => void decide(memory, "confirm")}>这是准确的</button>}
              {memory.status === "active" && <button disabled={busyId === memory.id} onClick={() => void decide(memory, "disable")}>暂不使用</button>}
              {memory.status === "disabled" && <button disabled={busyId === memory.id} onClick={() => void decide(memory, "enable")}>重新使用</button>}
              {memory.status === "active" && <button disabled={busyId === memory.id} onClick={() => void decide(memory, "reject")}>这不准确</button>}
              <button disabled={busyId === memory.id} onClick={() => { setEditing(memory); setDraft(memory.content); }}>纠正</button>
              <button className="memory-delete" disabled={busyId === memory.id} onClick={() => void remove(memory)}>删除</button>
            </div>
          </article>)}
        </section>)}
      </div>
      {editing && <div className="memory-edit" role="dialog" aria-modal="true" aria-labelledby="memory-edit-title">
        <h3 id="memory-edit-title">把这条记忆改准确</h3><textarea value={draft} maxLength={240} onChange={(event) => setDraft(event.target.value)} aria-label="纠正后的记忆" />
        <div><button onClick={() => setEditing(null)}>取消</button><button disabled={draft.trim().length < 3 || busyId === editing.id} onClick={() => void saveCorrection()}>保存纠正</button></div>
      </div>}
    </section>
  </div>;
}
