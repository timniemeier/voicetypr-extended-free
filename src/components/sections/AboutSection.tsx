import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { open } from '@tauri-apps/plugin-shell';
import { getVersion } from '@tauri-apps/api/app';
import {
  ExternalLink,
  GitFork,
  Github,
  Info,
} from "lucide-react";
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const UPSTREAM_VERSION = "1.12.3";
const UPSTREAM_REPO = "https://github.com/moinulmoin/voicetypr";

export function AboutSection() {
  const [appVersion, setAppVersion] = useState<string>('');

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

            <div className="rounded-lg border border-border/50 bg-card p-4">
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
        </div>
      </ScrollArea>
    </div>
  );
}
