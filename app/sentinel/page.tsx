"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const VIDEO_SRC = "/sample_media/sample_lowres.mp4";
// Try scream first; fallback to sample_lowres.wav if scream is missing (e.g. only one file in sample_media)
const AUDIO_SOURCES = ["/sample_media/sample_scream.wav", "/sample_media/sample_lowres.wav"];
const FPS_TARGET = 30;
const FRAME_INTERVAL = 1 / FPS_TARGET;
const DETECT_EVERY_N_FRAMES = 3;
const DEFAULT_THRESHOLD = 0.1;
const THRESHOLD_MIN = 0.05;
const THRESHOLD_MAX = 0.2;
const PERSON_CLASS = "person";
const BBOX_COLOR = "#22c55e";
const MOTION_TRAIL_MAX = 20;
const MOTION_TRAIL_ALPHA_DECAY = 0.15;

type DetectedPerson = {
  bbox: [number, number, number, number]; // x, y, w, h
  score: number;
  centerX: number;
  centerY: number;
  side: number; // square side
};

type MotionTrailPoint = {
  x: number;
  y: number;
  side: number;
  alpha: number;
};

export default function SentinelVerificationPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const detectFrameCounterRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fpsHistoryRef = useRef<number[]>([]);

  const [model, setModel] = useState<import("@tensorflow-models/coco-ssd").ObjectDetection | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [detections, setDetections] = useState<DetectedPerson[]>([]);
  const [frameNumber, setFrameNumber] = useState(0);
  const [fps, setFps] = useState(0);
  const [audioRms, setAudioRms] = useState(0);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showMotionTrail, setShowMotionTrail] = useState(false);
  const [motionTrail, setMotionTrail] = useState<MotionTrailPoint[]>([]);
  const [audioReady, setAudioReady] = useState(false);

  // Load COCO-SSD model
  const loadModel = useCallback(async () => {
    try {
      const coco = await import("@tensorflow-models/coco-ssd");
      const m = await coco.load();
      setModel(() => m);
      setModelReady(true);
    } catch (e) {
      console.error("Failed to load COCO-SSD:", e);
    }
  }, []);

  useEffect(() => {
    loadModel();
    return () => {
      if (model) {
        model.dispose?.();
      }
    };
  }, [loadModel]);

  // Square bbox: max(w,h) centered on person
  const toSquarePerson = (bbox: [number, number, number, number], score: number): DetectedPerson => {
    const [x, y, w, h] = bbox;
    const side = Math.max(w, h);
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    return {
      bbox: [x, y, w, h],
      score,
      centerX,
      centerY,
      side,
    };
  };

  const detectHumans = useCallback(
    async (video: HTMLVideoElement): Promise<DetectedPerson[]> => {
      if (!model || !modelReady) return [];
      try {
        const predictions = await model.detect(video);
        const people: DetectedPerson[] = [];
        for (const p of predictions) {
          if (p.class !== PERSON_CLASS || !p.bbox) continue;
          const [x, y, w, h] = p.bbox;
          people.push(toSquarePerson([x, y, w, h], p.score ?? 0));
        }
        return people;
      } catch (e) {
        console.error("Detection error:", e);
        return [];
      }
    },
    [model, modelReady],
  );

  const drawFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      video: HTMLVideoElement,
      currentDetections: DetectedPerson[],
      trail: MotionTrailPoint[],
    ) => {
      const { width, height } = ctx.canvas;
      ctx.drawImage(video, 0, 0, width, height);

      if (!showBoundingBoxes && trail.length === 0) return;

      // Motion trail (fading squares)
      if (showMotionTrail && trail.length > 0) {
        for (const t of trail) {
          ctx.strokeStyle = `rgba(34, 197, 94, ${t.alpha})`;
          ctx.lineWidth = 2;
          const half = t.side / 2;
          ctx.strokeRect(t.x - half, t.y - half, t.side, t.side);
        }
      }

      // Current frame boxes (square, green)
      if (showBoundingBoxes) {
        ctx.strokeStyle = BBOX_COLOR;
        ctx.lineWidth = 3;
        for (const d of currentDetections) {
          const half = d.side / 2;
          ctx.strokeRect(
            d.centerX - half,
            d.centerY - half,
            d.side,
            d.side,
          );
        }
      }
    },
    [showBoundingBoxes, showMotionTrail],
  );

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animationRef.current = requestAnimationFrame(tick);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      animationRef.current = requestAnimationFrame(tick);
      return;
    }

    const now = performance.now();
    const elapsed = (now - lastFrameTimeRef.current) / 1000;

    // FPS
    fpsHistoryRef.current.push(1 / (elapsed || 0.001));
    if (fpsHistoryRef.current.length > 30) fpsHistoryRef.current.shift();
    setFps(
      Math.round(
        fpsHistoryRef.current.reduce((a, b) => a + b, 0) /
          fpsHistoryRef.current.length,
      ),
    );
    lastFrameTimeRef.current = now;

    frameCountRef.current += 1;
    setFrameNumber(Math.floor(video.currentTime * FPS_TARGET));

    const runDetection =
      modelReady &&
      model &&
      detectFrameCounterRef.current % DETECT_EVERY_N_FRAMES === 0;

    if (runDetection) {
      detectFrameCounterRef.current = 0;
      detectHumans(video).then((people) => {
        setDetections(people);
        setMotionTrail((prev) => {
          const next: MotionTrailPoint[] = [];
          for (const p of people) {
            next.push({
              x: p.centerX,
              y: p.centerY,
              side: p.side,
              alpha: 1,
            });
          }
          const combined = [
            ...prev.map((t) => ({
              ...t,
              alpha: Math.max(0, t.alpha - MOTION_TRAIL_ALPHA_DECAY),
            })),
            ...next,
          ]
            .filter((t) => t.alpha > 0.05)
            .slice(-MOTION_TRAIL_MAX);
          return combined;
        });
      });
    }
    detectFrameCounterRef.current += 1;

    drawFrame(ctx, video, detections, motionTrail);

    animationRef.current = requestAnimationFrame(tick);
  }, [modelReady, model, detectHumans, drawFrame, detections, motionTrail]);

  useEffect(() => {
    tick();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [tick]);

  // Canvas size sync to video
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const onResize = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    };
    video.addEventListener("loadedmetadata", onResize);
    if (video.videoWidth) onResize();
    return () => video.removeEventListener("loadedmetadata", onResize);
  }, []);

  // Audio: load first available source, loop, AnalyserNode, RMS
  const startAudio = useCallback(async () => {
    if (audioContextRef.current) return;
    let lastError: Error | null = null;
    for (const src of AUDIO_SOURCES) {
      try {
        const res = await fetch(src);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(buf);
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.loop = true;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        source.start(0);
        audioContextRef.current = ctx;
        sourceNodeRef.current = source;
        analyserRef.current = analyser;
        setAudioReady(true);
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    console.warn("Audio failed (no source available):", lastError);
  }, []);

  useEffect(() => {
    startAudio();
    return () => {
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (_) {}
        audioContextRef.current = null;
      }
      sourceNodeRef.current = null;
      analyserRef.current = null;
    };
  }, [startAudio]);

  // RMS from analyser
  useEffect(() => {
    if (!analyserRef.current || !audioReady) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    let rafId: number;

    const sample = () => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const n = (data[i] - 128) / 128;
        sum += n * n;
      }
      const rms = Math.sqrt(sum / data.length);
      setAudioRms(rms);
      setIsAlertActive(rms >= threshold);
      rafId = requestAnimationFrame(sample);
    };
    rafId = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(rafId);
  }, [audioReady, threshold]);

  const handlePlay = useCallback(() => {
    videoRef.current?.play();
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const handleStepForward = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    const nextTime = Math.min(
      video.duration,
      video.currentTime + FRAME_INTERVAL,
    );
    video.currentTime = nextTime;
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      if (modelReady && model) {
        detectHumans(video).then(setDetections);
      }
    };
    video.addEventListener("seeked", onSeeked);
  }, [modelReady, model, detectHumans]);

  const handleReset = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.pause();
      setIsPlaying(false);
    }
    setDetections([]);
    setMotionTrail([]);
    setFrameNumber(0);
    setIsAlertActive(false);
    frameCountRef.current = 0;
    detectFrameCounterRef.current = 0;
  }, []);

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isAlertActive
          ? "bg-red-950 text-red-100"
          : "bg-zinc-950 text-zinc-100"
      }`}
    >
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          Sentinel Verification Dashboard
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          Frame-by-frame human detection · Audio monitoring · Level 1–3 verification prototype
        </p>

        {isAlertActive && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border-2 border-red-500 bg-red-900/50 px-4 py-3 text-lg font-semibold text-red-100">
            <span aria-hidden>⚠</span>
            <span>DANGEROUS AUDIO DETECTED</span>
          </div>
        )}

        {/* Fixed-size container so canvas doesn't resize when alert banner toggles (stops zoom in/out) */}
        <div className="mb-6 flex justify-center">
          <div
            className={`relative flex overflow-hidden rounded-lg transition-[box-shadow,border-color] duration-300 ${
              isAlertActive
                ? "ring-4 ring-red-500 shadow-lg shadow-red-500/30"
                : "ring-1 ring-zinc-700"
            }`}
            style={{ width: "100%", maxWidth: "896px", aspectRatio: "16/9", minHeight: "360px" }}
          >
            <video
              ref={videoRef}
              src={VIDEO_SRC}
              muted
              playsInline
              crossOrigin="anonymous"
              className="hidden"
              onLoadedMetadata={() => {
                const v = videoRef.current;
                const c = canvasRef.current;
                if (v && c && v.videoWidth && v.videoHeight) {
                  c.width = v.videoWidth;
                  c.height = v.videoHeight;
                }
              }}
            />
            <canvas
              ref={canvasRef}
              className="h-full w-full object-contain"
              style={{ display: "block" }}
            />
          </div>
        </div>

        <div className="mb-6 grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Frame
            </div>
            <div className="text-xl font-mono font-semibold">{frameNumber}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              FPS
            </div>
            <div className="text-xl font-mono font-semibold">{fps}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Audio RMS
            </div>
            <div className="text-xl font-mono font-semibold">
              {audioRms.toFixed(4)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Status
            </div>
            <div className="text-lg font-semibold">
              {isAlertActive ? (
                <span className="text-red-400">ALERT</span>
              ) : (
                <span className="text-emerald-400">Listening</span>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Danger threshold (RMS): {threshold.toFixed(3)}
          </label>
          <input
            type="range"
            min={THRESHOLD_MIN}
            max={THRESHOLD_MAX}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="h-2 w-full max-w-xs accent-red-500"
          />
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePlay}
              disabled={isPlaying}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Play
            </button>
            <button
              type="button"
              onClick={handlePause}
              disabled={!isPlaying}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Pause
            </button>
            <button
              type="button"
              onClick={handleStepForward}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
            >
              Step +1 frame
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
            >
              Reset
            </button>
          </div>
          <div className="flex items-center gap-4 border-l border-zinc-700 pl-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showBoundingBoxes}
                onChange={(e) => setShowBoundingBoxes(e.target.checked)}
              />
              Show Bounding Boxes
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showMotionTrail}
                onChange={(e) => setShowMotionTrail(e.target.checked)}
              />
              Show Motion Trail
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Detection status
          </h2>
          <p className="text-sm">
            Model: {modelReady ? "COCO-SSD loaded" : "Loading…"} · Persons this
            frame: {detections.length}
          </p>
          {!audioReady && (
            <p className="mt-1 text-xs text-amber-400">
              Audio: add sample_scream.wav or sample_lowres.wav to public/sample_media/ for danger detection.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
