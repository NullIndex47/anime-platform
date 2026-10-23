import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { useBlocker } from "react-router";

export const discardMessage =
  "Hay cambios sin guardar. ¿Quieres descartarlos y continuar?";
const Guards = createContext<Map<string, () => boolean> | null>(null);
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Map<string, () => boolean>()).current;
  const hasChanges = () => [...guards.values()].some((dirty) => dirty());
  const blocker = useBlocker(hasChanges);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(discardMessage)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [guards]);
  return <Guards.Provider value={guards}>{children}</Guards.Provider>;
}
export function useUnsavedChanges(dirty: boolean) {
  const guards = useContext(Guards);
  const id = useId();
  const current = useRef(dirty);
  current.current = dirty;
  useEffect(() => {
    guards?.set(id, () => current.current);
    return () => {
      guards?.delete(id);
    };
  }, [guards, id]);
  return () => !current.current || window.confirm(discardMessage);
}
