// components/VimeoEmbed.tsx
import React from "react";

interface VimeoEmbedProps {
  videoId: string;
  title?: string;
}

const VimeoEmbed: React.FC<VimeoEmbedProps> = ({ videoId, title = "" }) => {
  return (
    <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-lg shadow-lg border border-[var(--color-footer)]">
      <iframe
        src={`https://player.vimeo.com/video/${videoId}?badge=0&autopause=0&player_id=0&app_id=58479`}
        frameBorder="0"
        allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        title={title}
        className="absolute top-0 left-0 w-full h-full"
      ></iframe>
    </div>
  );
};

export default VimeoEmbed;
