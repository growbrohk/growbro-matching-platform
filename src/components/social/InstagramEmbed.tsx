import { useEffect, useRef } from 'react';

interface InstagramEmbedProps {
  url: string | null | undefined;
}

/**
 * InstagramEmbed component
 * Renders an Instagram post/reel embed using Instagram's official embed script
 */
export default function InstagramEmbed({ url }: InstagramEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!url || !containerRef.current) return;

    // Clear any existing content
    containerRef.current.innerHTML = '';

    // Create the blockquote element for Instagram embed
    // Instagram's embed script will automatically process this
    const blockquote = document.createElement('blockquote');
    blockquote.className = 'instagram-media';
    blockquote.setAttribute('data-instgrm-permalink', url);
    blockquote.setAttribute('data-instgrm-version', '14');
    blockquote.style.cssText = 'background:#FFF; border:0; border-radius:3px; box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin: 1px; max-width:100%; min-width:326px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);';

    // Create a link inside for the embed to work
    const link = document.createElement('a');
    link.href = url;
    link.style.cssText = 'background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%;';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    blockquote.appendChild(link);
    containerRef.current.appendChild(blockquote);

    // Process embeds immediately if script is already loaded
    const processEmbeds = () => {
      if (window.instgrm?.Embeds?.process) {
        window.instgrm.Embeds.process();
      }
    };

    // Try to process immediately
    processEmbeds();

    // Also process with a delay to ensure reliable rendering after modal opens
    const delayedProcess = setTimeout(() => {
      processEmbeds();
    }, 450); // 450ms delay (middle of 300-600ms range)

    // Wait for script to load if not already available
    let checkScriptInterval: NodeJS.Timeout | null = null;
    if (!window.instgrm?.Embeds) {
      checkScriptInterval = setInterval(() => {
        if (window.instgrm?.Embeds) {
          processEmbeds();
          if (checkScriptInterval) {
            clearInterval(checkScriptInterval);
          }
        }
      }, 100);

      // Cleanup interval after 10 seconds
      setTimeout(() => {
        if (checkScriptInterval) {
          clearInterval(checkScriptInterval);
        }
      }, 10000);
    }

    // Cleanup function
    return () => {
      if (delayedProcess) {
        clearTimeout(delayedProcess);
      }
      if (checkScriptInterval) {
        clearInterval(checkScriptInterval);
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [url]);

  if (!url) {
    return (
      <div className="flex items-center justify-center h-64 border rounded-lg bg-muted/50" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
        <p className="text-sm text-muted-foreground">No Instagram post URL provided</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="w-full flex justify-center"
      style={{ minHeight: '200px' }}
    />
  );
}

// Extend Window interface for Instagram embed script
declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process: () => void;
      };
    };
  }
}

