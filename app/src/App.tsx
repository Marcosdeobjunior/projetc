import { useEffect } from "react";
import { useApp } from "./state/store";
import { Home } from "./ui/Home";
import { Workspace } from "./ui/Workspace";
import { Icon } from "./ui/Icon";

const INFO_MS = 5000;

export function App() {
  const platform = useApp((s) => s.platform);
  const session = useApp((s) => s.session);
  const message = useApp((s) => s.message);
  const tone = useApp((s) => s.messageTone);
  const showMessage = useApp((s) => s.showMessage);

  useEffect(() => {
    void useApp.getState().init();
  }, []);

  // Avisos informativos somem sozinhos; os de erro ficam até serem fechados.
  useEffect(() => {
    if (!message || tone !== "info") return;
    const t = window.setTimeout(() => showMessage(null), INFO_MS);
    return () => window.clearTimeout(t);
  }, [message, tone, showMessage]);

  return (
    <>
      {message && (
        <div className={"toast " + tone} role={tone === "error" ? "alert" : "status"}>
          <span>{message}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Fechar aviso"
            onClick={() => showMessage(null)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {!platform ? null : session ? <Workspace key={session.root} session={session} /> : <Home />}
    </>
  );
}
