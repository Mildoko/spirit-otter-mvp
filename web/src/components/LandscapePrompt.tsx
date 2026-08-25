import { useEffect, useState } from "react";

const portraitMobileQuery = "(max-width: 960px) and (orientation: portrait)";

export function LandscapePrompt() {
  const [portraitMobile, setPortraitMobile] = useState(() => window.matchMedia(portraitMobileQuery).matches);
  const [dismissed, setDismissed] = useState(false);
  const [notice, setNotice] = useState("横屏能完整看到鹿禅的水面场景");

  useEffect(() => {
    const query = window.matchMedia(portraitMobileQuery);
    const update = () => setPortraitMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (!portraitMobile || dismissed) return null;

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
    <p className="eyebrow">横屏场景</p>
    <h2 id="landscape-title">请把手机横过来</h2>
    <p>{notice}</p>
    <button className="primary-button" onClick={() => void requestLandscape()}>全屏并尝试横屏</button>
    <button className="landscape-continue" onClick={() => setDismissed(true)}>暂时竖屏使用</button>
  </section>;
}
