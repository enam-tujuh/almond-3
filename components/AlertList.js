import React from "react";

function formatTimestamp(alert) {
  const raw = alert.time_iso || alert.time || alert.timestamp_iso;
  if (!raw) return "—";
  const d = new Date(raw);
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function thumbnailSrc(thumbnail) {
  if (!thumbnail) return null;
  const name = thumbnail.split(/[/\\]/).pop();
  if (!name) return null;
  return `/api/thumbnail?name=${encodeURIComponent(name)}`;
}

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
      {alerts.map((alert) => {
        const src = thumbnailSrc(alert.thumbnail);
        const meta = alert.metadata || {};
        const audioItems = meta.audio || [];
        const visualItems = meta.visual || [];
        const hasVisual = visualItems.length > 0;
        return (
          <div
            key={alert.id}
            className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm"
          >
            {src ? (
              <img
                src={src}
                alt="Blurred incident thumbnail"
                className="h-20 w-28 flex-shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-20 w-28 flex-shrink-0 flex-col items-center justify-center rounded-md bg-zinc-100 px-2 text-center text-xs text-zinc-500">
                {hasVisual
                  ? "No frame saved"
                  : "No visual confirmation in this clip"}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-900">
                  {alert.incident_type || "Unknown incident"}
                </span>
                <span className="text-xs text-zinc-500">
                  {formatTimestamp(alert)}
                </span>
              </div>
              <div className="text-xs text-zinc-600">
                {alert.location || "Singapore — Block 12 (simulated)"}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-600">
                <span>Confidence: {(alert.confidence * 100).toFixed(1)}%</span>
                <span>Sources: {alert.sources?.join(", ") || "—"}</span>
              </div>
              {(audioItems.length > 0 || visualItems.length > 0) && (
                <div className="space-y-0.5 border-t border-zinc-100 pt-1.5 text-xs text-zinc-500">
                  {audioItems.length > 0 &&
                    audioItems.map((a, i) => (
                      <div key={i}>
                        Audio: {a.label || "event"} ({(a.score * 100).toFixed(0)}%)
                        {a.start_sec != null && (
                          <span> at {a.start_sec.toFixed(1)}s</span>
                        )}
                      </div>
                    ))}
                  {visualItems.length > 0 &&
                    visualItems.map((v, i) => (
                      <div key={i}>
                        Visual: {v.class || "object"} ({(v.conf * 100).toFixed(0)}%)
                      </div>
                    ))}
                </div>
              )}
              <div className="mt-1.5 flex gap-2 text-xs">
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
        );
      })}
    </div>
  );
}


