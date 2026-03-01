import React from "react";

export default function AlertList({ alerts, onMark }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
        No alerts yet. Simulate an audio trigger to get started.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm"
        >
          {alert.thumbnail ? (
            // Next.js Image is not used here to keep this component framework-agnostic.
            // The thumbnail path is served from /tmp/thumbnails via the Next dev server.
            <img
              src={`/${alert.thumbnail}`}
              alt="Blurred incident thumbnail"
              className="h-16 w-24 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-16 w-24 items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-500">
              No image
            </div>
          )}

          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">
                {alert.incident_type || "Unknown incident"}
              </div>
              <div className="text-xs text-zinc-500">
                {new Date(alert.time_iso || alert.time || alert.timestamp_iso).toLocaleTimeString()}
              </div>
            </div>
            <div className="text-xs text-zinc-500">
              {alert.location || "Singapore — Block 12 (simulated)"}
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>Confidence: {(alert.confidence * 100).toFixed(1)}%</span>
              <span>Sources: {alert.sources?.join(", ") || "unknown"}</span>
            </div>
            <div className="mt-1 flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => onMark(alert.id, "confirmed")}
                className="rounded-full border border-emerald-500 px-2 py-0.5 text-emerald-600 hover:bg-emerald-50"
              >
                Confirmed
              </button>
              <button
                type="button"
                onClick={() => onMark(alert.id, "false_positive")}
                className="rounded-full border border-red-500 px-2 py-0.5 text-red-600 hover:bg-red-50"
              >
                False positive
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


