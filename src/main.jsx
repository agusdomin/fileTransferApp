import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import BackgroundLayout from "./layout/BackgroundLayout";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BackgroundLayout color="bg-blue-50">
      <App />
    </BackgroundLayout>
  </React.StrictMode>,
);
