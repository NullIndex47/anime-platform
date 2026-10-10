import { Info } from "lucide-react";
export function DemoNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-notice">
      <Info size={17} />
      <p>{children}</p>
    </div>
  );
}
