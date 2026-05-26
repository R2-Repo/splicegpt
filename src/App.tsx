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
  const [model, setModel] = useState<SpliceModel>(() => parseSpliceCsv(sampleCsv));
  const [overrides, setOverrides] = useState<DiagramOverrides>(() => cloneOverrides(emptyOverrides));
  const diagram = useMemo(() => buildDiagram(model, overrides), [model, overrides]);
  const diagnosticCount = model.warnings.length + diagram.routes.diagnostics.length;

  const importText = (text: string) => {
    setModel(parseSpliceCsv(text));
    setOverrides(cloneOverrides(emptyOverrides));
  };

  return (
    <main className="app-shell">
      <div className="top-import-bar">
        <label className="button button--primary">
          Import CSV
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={async (event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0];
              if (!file) return;
              importText(await readFileAsText(file));
              event.target.value = "";
            }}
          />
        </label>
        <button type="button" className="button" onClick={() => importText(sampleCsv)}>Load sample</button>
        <button type="button" className="button" onClick={() => setOverrides(cloneOverrides(emptyOverrides))}>Reset edits</button>
        <span className="status-pill">Live SVG routes</span>
        <span className="top-import-bar__meta">{model.cables.length} cables · {model.connections.length} splices · {diagnosticCount} diagnostics</span>
      </div>

      <SpliceCanvas
        layout={diagram.layout}
        routes={diagram.routes}
        overrides={overrides}
        onOverridesChange={setOverrides}
      />
    </main>
  );
}
