import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App"; // .js 확장자 제거
import ReactGA from "react-ga4"; // 추가

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

const gaTrackingId = import.meta.env.VITE_GA_TRACKING_ID;
if (gaTrackingId) {
  ReactGA.initialize(gaTrackingId);
  ReactGA.send({ hitType: "pageview", page: window.location.pathname }); // 초기 페이지뷰 전송
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
