// /pages/ContactPage.tsx
import { Mail, Phone } from "lucide-react";

const ContactPage = () => {
  return (
    <div className="min-h-screen pt-24 pb-16 px-4 text-[var(--color-text)] bg-[var(--color-dark)] mt-30">
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-4xl font-gin mb-2 text-white" data-aos="fade-up">
          Contact Us
        </h1>
        <p
          className="text-md text-[var(--color-accent-sage)] mb-10"
          data-aos="fade-up"
          data-aos-delay="100"
        >
          Reach out to us directly using the contacts below.
        </p>

        <div
          className="bg-[var(--color-card)] rounded-lg shadow-lg p-6 mb-6"
          data-aos="fade-up"
          data-aos-delay="200"
        >
          <h2 className="text-xl font-semibold text-[var(--color-accent-gold)] mb-2">
            Justin S.
          </h2>
          <p className="flex items-center justify-center gap-2 text-sm text-[var(--color-text)]">
            <Phone size={16} /> 956-466-9614
          </p>
        </div>

        <div
          className="bg-[var(--color-card)] rounded-lg shadow-lg p-6 mb-6"
          data-aos="fade-up"
          data-aos-delay="300"
        >
          <h2 className="text-xl font-semibold text-[var(--color-accent-gold)] mb-2">
            Allison W.
          </h2>
          <p className="flex items-center justify-center gap-2 text-sm text-[var(--color-text)]">
            <Phone size={16} /> 210-974-9496
          </p>
        </div>

        <div
          className="bg-[var(--color-card)] rounded-lg shadow-lg p-6"
          data-aos="fade-up"
          data-aos-delay="400"
        >
          <h2 className="text-xl font-semibold text-[var(--color-accent-gold)] mb-2">
            General Email
          </h2>
          <p className="flex items-center justify-center gap-2 text-sm text-[var(--color-text)]">
            <Mail size={16} />
            <a
              href="mailto:info@ranchodepalomablanca.com"
              className="underline hover:text-[var(--color-accent-gold)]"
            >
              info@ranchodepalomablanca.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
