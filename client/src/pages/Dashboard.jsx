import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { endpoints } from "../api/client.js";

export default function Dashboard() {
  const [health, setHealth] = useState(null);
  const [modules, setModules] = useState([]);
  const [goal, setGoal] = useState("Complete a wedding post-production workflow");
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    endpoints.health().then((res) => setHealth(res.data)).catch((err) => setError(err.message));
    endpoints.modules().then((res) => setModules(res.data?.modules || [])).catch((err) => setError(err.message));
  }, []);

  async function makePlan(event) {
    event.preventDefault();
    setPlan(await endpoints.plan(goal));
  }

  return (
    <section>
      <div className="hero">
        <p className="kicker">Photography Workflow Agent</p>
        <h1>Professional photography workflow</h1>
        <p>Integration shell is ready. Domain modules stay owned by other conversations.</p>
      </div>
      <div className="row">
        <div className="status">
          <span className={`dot ${health?.status === "ok" ? "ok" : "stub"}`} />
          {health ? `${health.service} v${health.version}` : "connecting..."}
        </div>
        {error ? <span className="status">{error}</span> : null}
      </div>
      <div className="grid">
        {modules.map((mod) => (
          <Link className="card" key={mod.id} to={`/${mod.id}`}>
            <span>{mod.branch}</span>
            <h3>{mod.title}</h3>
            <p className="status"><span className="dot stub" />{mod.status}</p>
          </Link>
        ))}
      </div>
      <form className="panel" style={{ marginTop: 24 }} onSubmit={makePlan}>
        <p className="kicker">Agent shell</p>
        <h2>Plan a run</h2>
        <div className="row">
          <input value={goal} onChange={(e) => setGoal(e.target.value)} />
          <button type="submit">Create plan</button>
        </div>
        {plan ? <pre>{JSON.stringify(plan.data || plan, null, 2)}</pre> : null}
      </form>
    </section>
  );
}
