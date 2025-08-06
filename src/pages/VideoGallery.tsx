import VimeoEmbed from "../components/VimeoEmbed";

const VideoGallery = () => {
  return (
    <div className="min-h-screen pt-24 pb-20 px-6 md:px-12 text-[var(--color-text)] bg-[var(--color-dark)] mt-30">
      <h1 className="text-4xl font-broadsheet text-center mb-12 text-[var(--color-accent-gold)]">
        Our Featured Videos
      </h1>
      <div className="grid md:grid-cols-2 gap-12 max-w-6xl mx-auto">
        <VimeoEmbed videoId="1107628873" title="DJI_20230912140455_0050_D" />
        <VimeoEmbed videoId="1107467779" title="Untitled" />
        <VimeoEmbed videoId="1107467779" title="Untitled (Duplicate Test)" />
      </div>
    </div>
  );
};

export default VideoGallery;
