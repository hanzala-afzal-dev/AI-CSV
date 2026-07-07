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

const serviceTones = [
  "border-l-accent-blue",
  "border-l-accent-green",
  "border-l-accent-rust",
  "border-l-accent-gold"
] as const;

export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-9 sm:px-6 sm:py-14 lg:px-8">
      <section className="grid items-end gap-8 border-b border-line pb-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <div>
          <p className="mb-3.5 text-sm font-bold uppercase text-accent-green">
            Agentic CSV Analyst Foundation
          </p>
          <h1 className="max-w-3xl text-5xl font-bold leading-none sm:text-7xl lg:text-8xl">
            Deterministic analytics, agent-ready orchestration.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            A strict TypeScript modular monolith where language models plan and explain,
            deterministic tools calculate, and retrieval stays scoped to verified context.
          </p>
        </div>
        <div
          className="flex flex-wrap content-end gap-2.5"
          aria-label="Foundation capabilities"
        >
          {services.map((service, index) => (
            <span
              key={service}
              className={`border border-line border-l-4 bg-panel px-3 py-2 text-sm font-semibold ${serviceTones[index % serviceTones.length]}`}
            >
              {service}
            </span>
          ))}
        </div>
      </section>

      <section
        className="grid gap-4 pt-7 lg:grid-cols-4"
        aria-label="Architecture boundaries"
      >
        {boundaries.map(([title, text]) => (
          <article key={title} className="min-h-44 border border-line bg-panel p-5">
            <h2 className="mb-3 text-base font-semibold">{title}</h2>
            <p className="leading-7 text-muted">{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
