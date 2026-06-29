import { App } from "./App";

// Bootstrap bcad once the DOM is ready.
function boot(): void {
  const root = document.getElementById("app");
  if (!root) {
    console.error("bcad: #app root not found");
    return;
  }
  const app = new App(root);
  app.start();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
