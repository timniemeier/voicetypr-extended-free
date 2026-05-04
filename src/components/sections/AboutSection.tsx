import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { open } from '@tauri-apps/plugin-shell';
import { getVersion } from '@tauri-apps/api/app';
import {
  ExternalLink,
  GitFork,
  Github,
  Info,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { updateService } from '@/services/updateService';

const UPSTREAM_VERSION = "1.12.3";
const UPSTREAM_REPO = "https://github.com/moinulmoin/voicetypr";

const FORK_CHANGELOG: { title: string; description: string }[] = [
  {
    title: "Editable AI formatting prompts",
    description:
      "New \"Custom Prompts (Advanced)\" panel on the Formatting page lets you edit the base post-processor and per-preset transforms (Prompts / Email / Commit), with a tabbed selector and per-field reset.",
  },
  {
    title: "About page customised for the fork",
    description:
      "Removed marketing links, surfaced upstream attribution, and added this changelog.",
  },
  {
    title: "Sidebar cleanup",
    description:
      "Removed the License nav entry, the Trial Expired badge, and the Upgrade to Pro CTA. Dropped the unreachable license route and event listener.",
  },
  {
    title: "License check bypassed",
    description:
      "check_license_status returns a fixed Licensed/Pro response so the app runs without a license server. Permitted under AGPL v3.",
  },
];

export function AboutSection() {
  const [appVersion, setAppVersion] = useState<string>('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await getVersion();
        setAppVersion(version);
      } catch (error) {
        console.error('Failed to get app version:', error);
        setAppVersion('Unknown');
      }
    };

    fetchVersion();
  }, []);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    await updateService.checkForUpdatesManually();
    setIsCheckingUpdate(false);
  };

  const openExternalLink = async (url: string) => {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open external link:', error);
      toast.error('Failed to open link');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">About</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Personal fork of VoiceTypr v{UPSTREAM_VERSION}
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* App Information Section */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold">App Information</h2>

            <div className="rounded-lg border border-border/50 bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Version</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono">
                    v{appVersion || 'Loading...'}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <GitFork className="h-3 w-3" />
                    Fork
                  </Badge>
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={handleCheckUpdate}
                  disabled={isCheckingUpdate}
                  variant="ghost"
                  size="sm"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
                </Button>
              </div>
            </div>
          </div>

          {/* Credits Section */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Credits</h2>

            <button
              onClick={() => openExternalLink(UPSTREAM_REPO)}
              className="w-full rounded-lg border border-border/50 bg-card p-4 flex items-center justify-between hover:bg-accent/50 transition-colors group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-accent">
                  <Github className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">VoiceTypr by moinulmoin</p>
                  <p className="text-xs text-muted-foreground">
                    Upstream project — v{UPSTREAM_VERSION} is the base of this fork. Licensed under AGPL v3.
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 ml-3" />
            </button>
          </div>

          {/* Fork Changelog Section */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Fork Changelog</h2>

            <div className="rounded-lg border border-border/50 bg-card divide-y divide-border/50">
              {FORK_CHANGELOG.map((entry) => (
                <div key={entry.title} className="p-4">
                  <p className="text-sm font-medium">{entry.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {entry.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
