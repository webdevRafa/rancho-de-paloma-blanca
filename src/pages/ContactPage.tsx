import { ArrowRight, ArrowUpRight, Mail, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import fieldImage from "../assets/images/image000001.jpeg";
import "./ContactPage.css";

const ContactPage = () => {
  return (
    <main className="contact-page">
      <section className="contact-hero" aria-labelledby="contact-title">
        <img
          className="contact-hero__image"
          src={fieldImage}
          alt="Sunlit fields at Rancho de Paloma Blanca"
          fetchPriority="high"
        />
        <div className="contact-hero__wash" aria-hidden="true" />
        <div className="contact-hero__grain" aria-hidden="true" />

        <div className="contact-shell contact-hero__layout">
          <div className="contact-hero__copy">
            <p className="contact-eyebrow">Contact the ranch</p>
            <h1 id="contact-title">Questions about your hunt?</h1>
            <p className="contact-hero__lede">
              Call Justin for help with booking, dates, group details, or your
              visit. For general questions, send the ranch an email.
            </p>
          </div>

          <div className="contact-panel" aria-label="Contact options">
            <header className="contact-panel__header">
              <p>Reach us directly</p>
              <h2>Call or email.</h2>
            </header>

            <div className="contact-options">
              <a
                className="contact-option contact-option--phone"
                href="tel:+19564669614"
                aria-label="Call Justin S. at 956-466-9614"
              >
                <span className="contact-option__icon" aria-hidden="true">
                  <Phone />
                </span>
                <span className="contact-option__content">
                  <span className="contact-option__label">Justin S.</span>
                  <strong>956-466-9614</strong>
                  <span className="contact-option__description">
                    Booking and hunt questions
                  </span>
                </span>
                <span className="contact-option__action">
                  Call Justin <ArrowUpRight aria-hidden="true" />
                </span>
              </a>

              <a
                className="contact-option"
                href="mailto:info@ranchodepalomablanca.com"
                aria-label="Email Rancho de Paloma Blanca at info@ranchodepalomablanca.com"
              >
                <span className="contact-option__icon" aria-hidden="true">
                  <Mail />
                </span>
                <span className="contact-option__content">
                  <span className="contact-option__label">General email</span>
                  <strong>info@ranchodepalomablanca.com</strong>
                  <span className="contact-option__description">
                    General questions for the ranch
                  </span>
                </span>
                <span className="contact-option__action">
                  Send an email <ArrowUpRight aria-hidden="true" />
                </span>
              </a>
            </div>

            <div className="contact-panel__booking">
              <div>
                <span>Ready to choose a date?</span>
                <strong>Book your 2026 hunt online.</strong>
              </div>
              <Link to="/book">
                Book a hunt <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default ContactPage;
