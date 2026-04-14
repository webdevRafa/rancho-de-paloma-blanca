import { motion } from "framer-motion";
import VimeoEmbed from "../components/VimeoEmbed";

const videos = [
  {
    videoId: "1107628873",
    title: "Finding the flocks",
    creator: "Rancho de Paloma Blanca",
    orientation: "landscape" as const,
    featured: true,
  },
  {
    videoId: "1107467779",
    title: "Covered skies",
    creator: "Rancho de Paloma Blanca",
    orientation: "landscape" as const,
    featured: true,
  },
  {
    videoId: "1182787763",
    title: "Morning action",
    creator: "Rancho de Paloma Blanca",
    orientation: "portrait" as const,
  },
  {
    videoId: "1182787764",
    title: "In the field",
    creator: "Rancho de Paloma Blanca",
    orientation: "portrait" as const,
  },
  {
    videoId: "1182787765",
    title: "South Texas hunts",
    creator: "Rancho de Paloma Blanca",
    orientation: "landscape" as const,
  },
  {
    videoId: "1182787766",
    title: "More from the ranch",
    creator: "Rancho de Paloma Blanca",
    orientation: "landscape" as const,
  },
  {
    videoId: "1182787740",
    title: "Birds & fields",
    creator: "Rancho de Paloma Blanca",
    orientation: "landscape" as const,
  },
  {
    videoId: "1107477099",
    title: "At the ranch",
    creator: "Rancho de Paloma Blanca",
    orientation: "landscape" as const,
  },
];

const VideoGallery = () => {
  const featuredVideos = videos.filter((video) => video.featured);
  const portraitVideos = videos.filter(
    (video) => video.orientation === "portrait"
  );
  const moreVideos = videos.filter(
    (video) => !video.featured && video.orientation !== "portrait"
  );

  return (
    <div className="min-h-screen bg-[var(--color-dark)] pt-24 pb-20 text-[var(--color-text)] md:pt-32">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-8 xl:px-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10 md:mb-14"
        >
          <p className="mb-3 text-xs uppercase tracking-[0.35em] text-[var(--color-accent-gold)]/75 md:text-sm">
            Videos
          </p>

          <h1 className="font-gin text-3xl text-[var(--color-accent-gold)] sm:text-4xl md:text-5xl">
            Watch the Rancho Experience
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--color-text)]/75 md:text-base">
            From birds working the fields to real moments around the ranch,
            explore a closer look at the atmosphere, action, and experience that
            define Rancho de Paloma Blanca.
          </p>
        </motion.div>

        {/* Featured landscape videos */}
        <section className="mb-12">
          <div className="grid gap-6 lg:grid-cols-2">
            {featuredVideos.map((video, index) => (
              <motion.article
                key={video.videoId}
                initial={{ opacity: 0, y: 24, scale: 0.985 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{
                  duration: 0.55,
                  delay: index * 0.06,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="overflow-hidden rounded-[28px]   shadow-[0_18px_45px_rgba(0,0,0,0.28)]"
              >
                <div className="p-4 md:p-5">
                  <VimeoEmbed
                    videoId={video.videoId}
                    title={video.title}
                    orientation={video.orientation}
                  />
                </div>
              </motion.article>
            ))}
          </div>
        </section>

        {/* Portrait videos */}
        {portraitVideos.length > 0 && (
          <section className="mb-12">
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 ">
              {portraitVideos.map((video, index) => (
                <motion.article
                  key={video.videoId}
                  initial={{ opacity: 0, y: 24, scale: 0.985 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{
                    duration: 0.5,
                    delay: index * 0.05,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="overflow-hidden  shadow-[0_18px_45px_rgba(0,0,0,0.26)]"
                >
                  <div className="mx-auto max-w-[360px] p-4 md:p-5">
                    <VimeoEmbed
                      videoId={video.videoId}
                      title={video.title}
                      orientation="portrait"
                    />
                  </div>
                </motion.article>
              ))}
            </div>
          </section>
        )}

        {/* Remaining landscape videos */}
        {moreVideos.length > 0 && (
          <section>
            <div className="grid gap-6 lg:grid-cols-2">
              {moreVideos.map((video, index) => (
                <motion.article
                  key={video.videoId}
                  initial={{ opacity: 0, y: 24, scale: 0.985 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{
                    duration: 0.55,
                    delay: index * 0.05,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="overflow-hidden  shadow-[0_18px_45px_rgba(0,0,0,0.26)]"
                >
                  <div className="p-4 md:p-5">
                    <VimeoEmbed
                      videoId={video.videoId}
                      title={video.title}
                      orientation="landscape"
                    />
                  </div>
                </motion.article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default VideoGallery;
