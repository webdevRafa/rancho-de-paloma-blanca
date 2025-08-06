import logo from "../assets/logo-official.webp";

const AboutPage = () => {
  return (
    <>
      <div className="min-h-screen pt-24 pb-20 px-6 text-[var(--color-text)] bg-[var(--color-dark)] flex items-center justify-center">
        <div className="max-w-3xl mx-auto text-center">
          <img
            data-aos="zoom-in-up"
            data-aos-delay="1300"
            className="w-full max-w-[200px] mx-auto"
            src={logo}
            alt=""
          />
          <p
            className="text-md text-[var(--color-text)] leading-7 mb-3"
            data-aos="fade-up"
            data-aos-delay="100"
          >
            Rancho de Paloma Blanca is a premier dove hunting operation proudly
            run under the 1419 Ranch in Brownsville, Texas.
          </p>

          <p
            className="text-md text-[var(--color-text)] leading-7 mb-3"
            data-aos="fade-up"
            data-aos-delay="200"
          >
            Managed by Steve Clark and Ray Loop, this family-owned and operated
            ranch has been rooted in the region for over 100 years.
          </p>

          <p
            className="text-md text-[var(--color-text)] leading-7"
            data-aos="fade-up"
            data-aos-delay="300"
          >
            With more than 30 years of experience in the dove hunting industry,
            Rancho de Paloma Blanca is committed to delivering a time-honored,
            authentic South Texas hunting experience.
          </p>
        </div>
      </div>
    </>
  );
};

export default AboutPage;
