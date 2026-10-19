"use client";
import { useEffect, useRef } from "react";
import { createLitgrid, type Litgrid as Instance, type Settings } from "@ampulla/litgrid";

// rendered on the server as a plain <canvas>; the instance only exists in the browser
export function Litgrid({ settings }: { settings?: Partial<Settings> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lg = useRef<Instance>(null);
  useEffect(() => {
    lg.current = createLitgrid(canvas.current!, { settings });
    return () => lg.current?.destroy();
  }, []);
  useEffect(() => { if (settings) lg.current?.update(settings); }, [settings]);
  return <canvas ref={canvas} style={{ width: "100%", aspectRatio: "16 / 9" }} />;
}
