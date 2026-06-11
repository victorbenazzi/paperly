import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/app/AppShell";

export default function App() {
  return (
    <TooltipProvider delayDuration={350}>
      <AppShell />
    </TooltipProvider>
  );
}
