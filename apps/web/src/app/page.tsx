const boundaries = [
  ["Domain", "Dataset aggregate, lifecycle rules, domain errors and events."],
  ["Application", "CQRS handlers and ports for persistence, storage, and events."],
  ["Infrastructure", "PostgreSQL, Redis, BullMQ, S3, Qdrant, DuckDB, logging."],
  ["Delivery", "Next.js web process and separate BullMQ worker process."]
] as const;

const services = [
  "PostgreSQL",
  "Redis",
  "Qdrant",
  "LocalStack S3",
  "DuckDB",
  "LangGraph"
];

export default function Home() {
  return (
    <main className="shell">
      <section className="intro">
        <div>
          <p className="eyebrow">Agentic CSV Analyst Foundation</p>
          <h1>Deterministic analytics, agent-ready orchestration.</h1>
          <p className="lede">
            A strict TypeScript modular monolith where language models plan and explain,
            deterministic tools calculate, and retrieval stays scoped to verified context.
          </p>
        </div>
        <div className="statusPanel" aria-label="Foundation capabilities">
          {services.map((service) => (
            <span key={service}>{service}</span>
          ))}
        </div>
      </section>

      <section className="boundaryGrid" aria-label="Architecture boundaries">
        {boundaries.map(([title, text]) => (
          <article key={title} className="boundary">
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
