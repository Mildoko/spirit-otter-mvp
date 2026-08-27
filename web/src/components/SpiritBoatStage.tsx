import boatUserUrl from "../assets/scene-world-v1/layer-boat-user-transparent-v2.png";
import deerUrl from "../assets/spirit-deer-zen-v1.png";
import otterUrl from "../assets/scene-world-v1/layer-otter-v1.png";

export function SpiritBoatStage({ context }: { context: "inner" | "outer" }) {
  return <div className={`spirit-boat-stage spirit-boat-stage-${context}`} aria-hidden="true">
    <span className="spirit-boat-light" />
    <img className="spirit-boat-layer spirit-boat-user-layer" src={boatUserUrl} alt="" />
    <img className="spirit-boat-layer spirit-boat-otter-layer" src={otterUrl} alt="" />
    <img className="spirit-boat-deer-seated" src={deerUrl} alt="" />
  </div>;
}
