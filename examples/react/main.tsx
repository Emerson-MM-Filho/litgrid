// the README's React component, mounted in StrictMode (which mounts, destroys and mounts again)
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Litgrid } from "./Litgrid";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Litgrid settings={{ text: "React", followMouse: true }} />
  </StrictMode>,
);
