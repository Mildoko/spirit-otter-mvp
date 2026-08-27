import type { AgentIdV1, PublicPortalItemV01 } from "@otter/shared";
import outerGalleryBackground from "../assets/outer-circle-v0.1/outer-gallery-bg-v6-centered-lit.png";
import outerGalleryEnvironment from "../assets/outer-circle-v0.1/outer-gallery-environment-clean-v1.png";
import type { OuterCirclePhase } from "../lib/outer-circle-state";
import { SpiritBoatStage } from "./SpiritBoatStage";

interface OuterCircleWorldProps {
  phase: Extract<OuterCirclePhase, "loading" | "gallery" | "detail" | "exiting">;
  items: PublicPortalItemV01[];
  selectedItem?: PublicPortalItemV01;
  activeAgentId: AgentIdV1;
  activeAgentName: string;
  onOpenItem: (item: PublicPortalItemV01) => void;
  onCloseDetail: () => void;
  onReturnInner: () => void;
  onCarryInner: (item: PublicPortalItemV01, target: AgentIdV1) => void;
}

export function OuterCircleWorld({
  phase,
  items,
  selectedItem,
  activeAgentId,
  activeAgentName,
  onOpenItem,
  onCloseDetail,
  onReturnInner,
  onCarryInner,
}: OuterCircleWorldProps) {
  return (
    <section className={`outer-circle-world outer-circle-${phase}`} aria-label="外圈万象廊">
      <img className="outer-circle-background outer-circle-background-desktop" src={outerGalleryBackground} alt="" aria-hidden="true" />
      <img className="outer-circle-background outer-circle-background-mobile" src={outerGalleryEnvironment} alt="" aria-hidden="true" />
      <div className="outer-circle-vignette" aria-hidden="true" />
      <SpiritBoatStage context="outer" />

      <button type="button" className="outer-return-button" onClick={onReturnInner}>
        <span aria-hidden="true">←</span> 返回船上
      </button>

      {phase === "loading" && <div className="outer-loading" role="status" aria-live="polite">
        <span className="outer-loading-mark" aria-hidden="true" />
        <strong>正在走向万象廊</strong>
        <small>这里只展示公开演示内容</small>
      </div>}

      {(phase === "gallery" || phase === "exiting") && <div className="outer-gallery-content">
        <header className="outer-gallery-heading">
          <p>外圈 · PUBLIC OUTER CIRCLE</p>
          <h1>万象廊</h1>
          <span>看看外面正在发生什么。浏览不会加入活动，也不会读取船上的对话。</span>
        </header>

        <div className="outer-film-corridor">
          <div className="outer-portal-grid" aria-label="公开内容">
            {items.map((item, index) => <article className={`outer-portal-card outer-theme-${item.coverTheme}`} key={item.id}>
              <button type="button" onClick={() => onOpenItem(item)} aria-label={`查看：${item.title}`}>
                <span className="outer-card-index" aria-hidden="true">0{index + 1}</span>
                <span className="outer-card-lane">{item.laneLabel}</span>
                <span className="outer-card-art" aria-hidden="true"><i /><i /><i /></span>
                <strong>{item.title}</strong>
                <span className="outer-card-summary">{item.summary}</span>
                <span className="outer-card-time">{item.timeLabel}</span>
                {item.lane === "possibly_relevant" && <small>编辑推荐 · 未读取你的私密对话</small>}
                <span className="outer-card-open">看一眼 <b aria-hidden="true">↗</b></span>
              </button>
            </article>)}
          </div>
        </div>

        <footer className="outer-gallery-footnote">
          <span>演示目录 · 信息尚未核验</span>
          <span>当前只读：不能报名、发帖或联系他人</span>
        </footer>
      </div>}

      {phase === "detail" && selectedItem && <article className="outer-detail" aria-labelledby="outer-detail-title">
        <button type="button" className="outer-detail-back" onClick={onCloseDetail}>← 回到万象廊</button>
        <div className={`outer-detail-visual outer-theme-${selectedItem.coverTheme}`} aria-hidden="true"><i /><i /><i /></div>
        <div className="outer-detail-copy">
          <p>{selectedItem.laneLabel} · {selectedItem.dataStatus === "demo" ? "演示内容" : "公开内容"}</p>
          <h1 id="outer-detail-title">{selectedItem.title}</h1>
          <p className="outer-detail-summary">{selectedItem.summary}</p>
          <dl>
            <div><dt>时间</dt><dd>{selectedItem.timeLabel}</dd></div>
            <div><dt>地点</dt><dd>{selectedItem.placeLabel}</dd></div>
            <div><dt>状态</dt><dd>{selectedItem.accessLabel}</dd></div>
            <div><dt>来源</dt><dd>{selectedItem.sourceLabel}</dd></div>
          </dl>
          <p className="outer-detail-body">{selectedItem.detail}</p>
          <div className="outer-detail-tags">{selectedItem.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <div className="outer-detail-actions">
            <button type="button" className="outer-primary-action" onClick={() => onCarryInner(selectedItem, "bird_courier")}>带回船上，交给飞儿</button>
            {activeAgentId !== "bird_courier" && <button type="button" onClick={() => onCarryInner(selectedItem, activeAgentId)}>带回船上，和{activeAgentName}聊聊</button>}
          </div>
          <small className="outer-detail-honesty">“带回”只复制这条公共内容，不会报名，也不会自动保存成你的兴趣。</small>
        </div>
      </article>}
    </section>
  );
}
