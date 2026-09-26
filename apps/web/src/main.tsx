import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

// ERP sign-in to the Brain Console (ADR-016): ERP hands a console-scoped assertion in the URL fragment. Keep it for
// this browser tab only and remove it from the address bar and history.
if (location.hash.startsWith("#erp_token=")) {
  sessionStorage.setItem("cdi-token", decodeURIComponent(location.hash.slice("#erp_token=".length)));
  sessionStorage.setItem("cdi-signin", "erp");
  history.replaceState(null, "", location.pathname + location.search);
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
