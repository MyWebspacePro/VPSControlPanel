import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import App from "./App";
import Dashboard from "./routes/Dashboard";
import Coolify from "./routes/Coolify";
import Hestia from "./routes/Hestia";
import GitHub from "./routes/GitHub";
import Settings from "./routes/Settings";
import { PullRequestDetail, IssueDetail, RepoView } from "./routes/GitHubDetail";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="coolify/*" element={<Coolify />} />
          <Route path="hestia" element={<Hestia />} />
          <Route path="github" element={<GitHub />} />
          <Route
            path="github/prs/:owner/:repo/:number"
            element={<PullRequestDetail />}
          />
          <Route
            path="github/issues/:owner/:repo/:number"
            element={<IssueDetail />}
          />
          <Route
            path="github/repos/:owner/:repo"
            element={<RepoView />}
          />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
