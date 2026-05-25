import { useMemo, useState, type ChangeEvent } from "react";
import { SpliceCanvas } from "./components/SpliceCanvas";
import { buildDiagram, emptyOverrides } from "./engine/buildDiagram";
import { parseSpliceCsv } from "./engine/parseCsv";
import type { DiagramOverrides, SpliceModel } from "./engine/types";
import { sampleCsv } from "./data/sampleCsv";
import "./styles.css";

function cloneOverrides(overrides: DiagramOverrides): DiagramOverrides {
  return {
    cableOverrides: { ...overrides.cableOverrides },
    protectedConnectionIds: { ...overrides.protectedConnectionIds },
  };
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsText(file);
  });
}

export default function App() {
  const [csvText, setCsvText] = useState(sampleCsv);
  const [model, setModel] = useState<SpliceModel>(() => parseSpliceCsv(sampleCsv));
  const [overrides, setOverrides] = useState<DiagramOverrides>(() => cloneOverrides(emptyOverrides));
  const diagram = useMemo(() => buildDiagram(model, overrides), [model, overrides]);
  const allDiagnostics = [...model.warnings.map((message) => ({ level: "warning" as const, code: "CSV", message })), ...diagram.routes.diagnostics];

  const importText = (text: string) => {
    const next = parseSpliceCsv(text);
    setCsvText(text);
    setModel(next);
    setOverrides(cloneOverrides(emptyOverrides));
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">front-end splice detail prototype</p>
          <h1>Splice Routing Engine Canvas</h1>
          <p className="app-subtitle">
            CSV import, deterministic layout, full-diagram strand rerouting, manual cable dragging, and simple validation.
          </p>
        </div>
        <div className="header-actions">
          <label className="button button--primary">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={async (event: ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const text = await readFileAsText(file);
                importText(text);
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" className="button" onClick={() => importText(sampleCsv)}>Load sample</button>
          <button type="button" className="button" onClick={() => setOverrides(cloneOverrides(emptyOverrides))}>Reset edits</button>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <span>Cables</span>
          <strong>{model.cables.length}</strong>
        </div>
        <div className="stat-card">
          <span>Connections</span>
          <strong>{model.connections.length}</strong>
        </div>
        <div className="stat-card">
          <span>Manual cable edits</span>
          <strong>{Object.keys(overrides.cableOverrides).length}</strong>
        </div>
        <div className="stat-card">
          <span>Diagnostics</span>
          <strong>{allDiagnostics.length}</strong>
        </div>
      </section>

      <section className="workspace-grid">
        <aside className="side-panel">
          <div className="panel-section">
            <h2>Import format</h2>
            <p>
              The prototype supports a simple normalized CSV and a lightweight Bentley-like parser for rows containing <code>&lt;-&gt;</code>.
            </p>
            <textarea
              value={csvText}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setCsvText(event.target.value)}
              spellCheck={false}
            />
            <button type="button" className="button button--wide" onClick={() => importText(csvText)}>
              Rebuild from text
            </button>
          </div>

          <div className="panel-section">
            <h2>Engine contract</h2>
            <ol className="engine-list">
              <li>Parse CSV into a canonical splice model.</li>
              <li>Apply manual edits as constraints only.</li>
              <li>Rebuild full layout on every change.</li>
              <li>Reroute every strand globally.</li>
              <li>Validate routes before rendering/export.</li>
            </ol>
          </div>

          <div className="panel-section">
            <h2>Diagnostics</h2>
            {allDiagnostics.length === 0 ? (
              <p className="success">No warnings.</p>
            ) : (
              <ul className="diagnostics-list">
                {allDiagnostics.map((item, index) => (
                  <li key={`${item.code}-${index}`} className={`diagnostic diagnostic--${item.level}`}>
                    <strong>{item.code}</strong>
                    <span>{item.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <SpliceCanvas
          layout={diagram.layout}
          routes={diagram.routes}
          overrides={overrides}
          onOverridesChange={setOverrides}
        />
      </section>
    </main>
  );
}
