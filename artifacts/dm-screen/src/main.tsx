import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { runMigrationsOnce } from "./lib/migrations";

// Run pre-React-mount so any one-shot key-shape migrations are done
// before widgets read their `useLocalStorage` initial values.
runMigrationsOnce();

createRoot(document.getElementById("root")!).render(<App />);
