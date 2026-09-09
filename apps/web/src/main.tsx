import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main>
      <h1>RequestLab</h1>
      <p>API hata izleme ve tekrar oynatma paneli</p>
      <strong>Altyapı hazır</strong>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
