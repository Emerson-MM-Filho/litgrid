import { useEffect, useRef } from "react";
import { createLitgrid, type Settings } from "@ampulla/litgrid";

export function Litgrid({ settings }: { settings?: Partial<Settings> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const lg = createLitgrid(canvas.current!, { settings });
    return () => lg.destroy();
  }, []);
  return <canvas ref={canvas} style={{ width: "100%", aspectRatio: "16 / 9" }} />;
}
