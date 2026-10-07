import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
// No StrictMode: its double-mounting would distort the first-frame load measurement.
createRoot(root).render(<App />);
