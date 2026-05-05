import { useEffect } from "react";
import { toast } from "sonner";
import { LLMModelsSection } from "../sections/LLMModelsSection";
import { useEventCoordinator } from "@/hooks/useEventCoordinator";

export function LLMModelsTab() {
  const { registerEvent } = useEventCoordinator("main");

  // Initialize LLM Models tab event handlers
  useEffect(() => {
    const init = async () => {
      try {
        registerEvent("ai-enhancement-auth-error", (event) => {
          console.error("AI authentication error:", event.payload);
          toast.error(event.payload as string, {
            description: "Please update your API key in the LLM Models section",
          });
        });

        registerEvent("ai-enhancement-error", (event) => {
          console.warn("AI formatting error:", event.payload);
          toast.warning(event.payload as string);
        });
      } catch (error) {
        console.error("Failed to initialize LLM Models tab:", error);
      }
    };

    init();
  }, [registerEvent]);

  return <LLMModelsSection />;
}
