import { useEffect, useMemo, useState } from "react";
import AlertList from "../components/AlertList";

const FIVE_MB_PER_SEC = 5 * 1024 * 1024;
const ONE_KB = 1024;

export default function Home() {
  const [alerts, setAlerts] = useState([]);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [sendingToTelegram, setSendingToTelegram] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [lastAction, setLastAction] = useState("");

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/alerts");
        if (!res.ok) return;
        const data = await res.json();
        setAlerts(data || []);
      } catch (e) {
        console.error("Failed to fetch alerts", e);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const bandwidthRatio = useMemo(() => {
    const jsonSizeBytes = JSON.stringify(alerts || []).length || ONE_KB;
    const ratio = FIVE_MB_PER_SEC / jsonSizeBytes;
    return ratio.toFixed(0);
  }, [alerts]);

  async function simulateTrigger() {
    setStatus("Listening (CPU ~2%)");
    setLastAction("Simulating audio trigger from sample_scream.wav");
    try {
      const res = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: "public/sample_media/sample_scream.wav",
        }),
      });
      if (!res.ok) {
        console.error("Trigger failed");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => {
        setStatus("Verifying (GPU active)");
      }, 2000);
      setTimeout(() => {
        setStatus("Idle");
      }, 15000);
    }
  }

  async function simulateNetworkToggle() {
    const next = !networkOnline;
    try {
      await fetch("/api/simulate_network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: next }),
      });
      setNetworkOnline(next);
      setLastAction(
        next ? "Network restored — alerts will be sent" : "Network offline — alerts will be queued locally",
      );
    } catch (e) {
      console.error(e);
    }
  }

  function handleMark(alertId, label) {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              review: label,
            }
          : a,
      ),
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-2 border-b border-zinc-200 pb-4 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Sentinel-Local Command Center
            </h1>
            <p className="text-sm text-zinc-500">
              Simulated edge node for privacy-preserving safety monitoring in Singapore (Data.gov.sg context).
            </p>
          </div>
          <div className="text-xs text-zinc-500">
            Prototype running locally on your laptop (RTX 4070 friendly).
          </div>
        </header>

        <main className="grid gap-6 md:grid-cols-[2fr,1.2fr]">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">
              Alerts
            </h2>
            <AlertList alerts={alerts} onMark={handleMark} />
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-zinc-800">
                Controls
              </h2>
              <div className="space-y-2 text-sm">
                <button
                  type="button"
                  onClick={simulateTrigger}
                  className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Simulate Audio Trigger
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setStatus("Verifying (GPU active)");
                    setLastAction("Manual visual verification requested");
                    try {
                      await fetch("/api/verify", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          input: "public/sample_media/sample_lowres.mp4",
                        }),
                      });
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setTimeout(() => setStatus("Idle"), 10000);
                    }
                  }}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Manual Visual Verify
                </button>

                <div className="pt-2 text-xs text-zinc-500">
                  Upload controls are included for completeness, but the default
                  demo uses sample files in <code>public/sample_media</code> to
                  keep things simple.
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-zinc-800">
                Network &amp; Notifications
              </h2>
              <div className="space-y-3 text-sm">
                <button
                  type="button"
                  onClick={simulateNetworkToggle}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  {networkOnline ? "Simulate Network Failure" : "Restore Network"}
                </button>

                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sendingToTelegram}
                    onChange={() => setSendingToTelegram((v) => !v)}
                  />
                  <span>Send alerts to Telegram (simulated in README)</span>
                </label>

                <p className="text-xs text-zinc-500">
                  When enabled and configured, the server can forward alert
                  summaries as low-bandwidth Telegram messages instead of video.
                </p>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-zinc-800">
                Resource snapshot
              </h2>
              <div className="space-y-1 text-sm">
                <div className="font-medium text-emerald-700">{status}</div>
                <div className="text-xs text-zinc-500">
                  Approximate: Listening (CPU ~2%) / Verifying (GPU active).
                  For a live GPU snapshot, run <code>nvidia-smi</code> during
                  the demo.
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-zinc-800">
                Bandwidth saved
              </h2>
              <div className="space-y-1 text-sm">
                <div>
                  Streaming 1080p video at ~5&nbsp;MB/s vs. alert JSON at
                  ~1&nbsp;KB:
                </div>
                <div className="text-xl font-semibold text-emerald-700">
                  {bandwidthRatio}x smaller
                </div>
                <div className="text-xs text-zinc-500">
                  This prototype only sends structured alerts and blurred
                  thumbnails, never raw video off the device.
                </div>
                {lastAction && (
                  <div className="mt-2 text-xs text-zinc-500">
                    Last action: {lastAction}
                  </div>
                )}
              </div>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}

