import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import ModulePage from "./pages/ModulePage.jsx";

const LINKS = [
  ["/", "總覽"],
  ["/jobs", "檔期"],
  ["/ingest", "匯入"],
  ["/catalog", "目錄"],
  ["/culling", "挑圖"],
  ["/develop", "顯影"],
  ["/retouch", "修圖"],
  ["/color", "色彩"],
  ["/export", "匯出"],
  ["/gallery", "相簿"],
];

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          攝影工作流代理
          <small>Integration shell</small>
        </div>
        <nav className="nav">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/:moduleId" element={<ModulePage />} />
        </Routes>
      </main>
    </div>
  );
}
