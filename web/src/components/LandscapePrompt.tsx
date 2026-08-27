import { useEffect, useState } from "react";

const portraitQuery = "(orientation: portrait)";

export function LandscapePrompt() {
  const [portrait, setPortrait] = useState(() => window.matchMedia(portraitQuery).matches);
  const [notice, setNotice] = useState("这次体验只提供横屏版本");

  useEffect(() => {
    const query = window.matchMedia(portraitQuery);
    const update = () => setPortrait(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (!portrait) return null;

  const requestLandscape = async () => {
    let fullscreenWorked = Boolean(document.fullscreenElement);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        fullscreenWorked = true;
      }
    } catch {
      fullscreenWorked = false;
    }

    try {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: "landscape") => Promise<void> };
      if (orientation.lock) await orientation.lock("landscape");
      else throw new Error("unsupported");
    } catch {
      setNotice(fullscreenWorked ? "请把手机横过来；当前浏览器不能自动旋转屏幕" : "请打开系统自动旋转，并把手机横过来");
    }
  };

  return <section className="landscape-prompt" role="dialog" aria-modal="true" aria-labelledby="landscape-title">
    <div className="landscape-phone" aria-hidden="true"><span /></div>
    <p className="eyebrow">仅支持横屏</p>
    <h2 id="landscape-title">请把手机横过来</h2>
    <p aria-live="polite">{notice}</p>
    <button className="primary-button" onClick={() => void requestLandscape()}>全屏并尝试横屏</button>
  </section>;
}
