// components/VimeoEmbed.tsx
import React from "react";

interface VimeoEmbedProps {
  videoId: string;
  title?: string;
  orientation?: "landscape" | "portrait";
}

const VimeoEmbed: React.FC<VimeoEmbedProps> = ({
  videoId,
  title = "",
  orientation = "landscape",
}) => {
  const isPortrait = orientation === "portrait";

  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_18px_50px_rgba(0,0,0,0.28)]",
        isPortrait ? "aspect-[9/16]" : "aspect-video",
      ].join(" ")}
    >
      <iframe
        src={`https://player.vimeo.com/video/${videoId}?badge=0&autopause=0&player_id=0&app_id=58479`}
        frameBorder="0"
        allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        title={title}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
};

export default VimeoEmbed;
