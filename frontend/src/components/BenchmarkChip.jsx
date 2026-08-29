import React, { useEffect, useState } from "react";
import * as api from "../api.js";

// Small chip on the Dashboard header that surfaces the latest stress-benchmark
// headline: "verified N payments in Ts (rate rec/s)". Falls silent if benchmark
// data is missing (the endpoint 404s cleanly).

const C = {
  ink: "#1F2A1A",
  softText: "#5C6752",
  moss: "#4B7B4E",
  border: "rgba(31,42,26,0.14)",
};

export default function BenchmarkChip() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.getBenchmark().then(setData).catch(() => setData(null));
  }, []);
  if (!data || !data.headline) return null;
  const h = data.headline;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md font-mono"
      style={{
        background: "rgba(75,123,78,0.06)",
        border: `1px solid ${C.moss}`,
        color: C.ink,
      }}
      title={`Last benchmark run ${data.generated_at || ""} · ${h.peak_memory_mb} MB peak`}
    >
      <i className="fa-solid fa-gauge-high text-xs" style={{ color: C.moss }} />
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.moss }}>
        Benchmark
      </span>
      <span className="text-[11px] tabular-nums">
        {(h.rows).toLocaleString("en-IN")} rows · {h.elapsed_seconds}s · {(h.throughput_rps).toLocaleString("en-IN")} rec/s
      </span>
    </div>
  );
}
