import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { Provider } from "react-redux";
import appStore from "./store/appStore";

import * as process from "process";

window.global = window;
window.process = process;
window.Buffer = [];

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  // <React.StrictMode>
   
  <Provider store={appStore}>
    <App />
  </Provider>

  // </React.StrictMode>
);

