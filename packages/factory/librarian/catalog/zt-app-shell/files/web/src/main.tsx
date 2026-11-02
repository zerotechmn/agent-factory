import { App as AntApp, ConfigProvider } from "antd";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { antdLocale, theme } from "./theme";
import "./styles.css";

// ZT §13: ConfigProvider carries the theme and locale; the antd App wrapper
// makes App.useApp() message/notification/modal pick them up (ZT §9).
// Wrap <App /> in your session or data providers inside BrowserRouter.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={antdLocale} theme={theme}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
