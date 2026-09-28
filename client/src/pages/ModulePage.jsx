import { useParams } from "react-router-dom";

const COPY = {
  jobs: "Jobs and shoots. Owned by feat/jobs.",
  ingest: "Ingest. Owned by feat/ingest.",
  catalog: "Catalog. Owned by feat/catalog.",
  culling: "Culling. Owned by feat/culling.",
  develop: "Develop. Owned by feat/develop.",
  retouch: "Retouch. Owned by feat/retouch.",
  color: "Color. Owned by feat/color.",
  export: "Export. Owned by feat/export.",
  gallery: "Gallery. Owned by feat/gallery.",
};

export default function ModulePage() {
  const { moduleId } = useParams();
  return (
    <section>
      <p className="kicker">Module stub</p>
      <h1>{moduleId}</h1>
      <p className="placeholder">
        {COPY[moduleId] || "Reserved module page."} Integration only provides navigation. API returns 501 MODULE_NOT_IMPLEMENTED.
      </p>
    </section>
  );
}
