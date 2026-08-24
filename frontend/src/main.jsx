import React from "react";
import { createRoot } from "react-dom/client";
import AppShell from "./AppShell.jsx";
import { SHARED_STYLES } from "./styles.js";

const styleEl = document.createElement("style");
styleEl.innerHTML = SHARED_STYLES;
document.head.appendChild(styleEl);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
);
