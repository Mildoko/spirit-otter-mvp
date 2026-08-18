import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ContentLab } from "./ContentLab";
import "./styles.css";
import { AudioProvider } from "./audio/AudioProvider";

const contentLabEnabled = new URLSearchParams(window.location.search).get("lab") === "1";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {contentLabEnabled ? <ContentLab /> : <AudioProvider><App /></AudioProvider>}
  </StrictMode>,
);
