import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthGate>
      {({ authEmail, authProtected, authBypassed, onSignOut }) => (
        <App authEmail={authEmail} authProtected={authProtected} authBypassed={authBypassed} onSignOut={onSignOut} />
      )}
    </AuthGate>
  </React.StrictMode>
);
