// server rendering of the README's SSR component, as a framework does it: the package is imported in
// Node, where there is no window, and the component renders to HTML without creating an instance
import { renderToString } from "react-dom/server";
import { Litgrid } from "./Litgrid";

console.log(renderToString(<Litgrid settings={{ text: "SSR" }} />));
