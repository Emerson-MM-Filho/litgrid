// the README's React component, mounted in StrictMode (which mounts, destroys and mounts again);
// the button swaps the palette after mounting, to show that new settings reach the canvas
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { PRESETS } from "@ampulla/litgrid";
import { Litgrid } from "./Litgrid";

function App() {
  const [preset, setPreset] = useState("Terracotta on night");
  return (
    <>
      <button onClick={() => setPreset("Ink on paper")}>Swap palette</button>
      <Litgrid settings={{ text: "React", followMouse: true, ...PRESETS[preset] }} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
