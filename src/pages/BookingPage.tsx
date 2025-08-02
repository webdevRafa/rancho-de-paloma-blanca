import BookingForm from "../components/BookingForm";
import { useAuth } from "../context/AuthContext";
import gsignup from "../assets/google-signup.png";
import dove from "../assets/dove.webp";

const BookingPage = () => {
  const { user, login } = useAuth();

  return (
    <>
      <div className="min-h-screen text-[var(--color-text)] relative">
        <div className="w-full h-[40vh] md:h-[50vh] z-[-10] opacity-50 blur-[1px]">
          <img className="object-cover h-full w-full" src={dove} alt="" />
        </div>
        <h1 className="text-center text-4xl md:text-6xl font-broadsheet mb-5 text-neutral-300 translate-y-[-70%]">
          Book a Hunt
        </h1>

        {/* Packages */}
        <section className="max-w-4xl mx-auto mb-16 grid md:grid-cols-3 gap-6 py-2 md:py-10">
          {[
            { label: "One-Day Hunt", desc: "$200 per person", key: "1-day" },
            { label: "Two-Day Combo", desc: "$350 total", key: "2-day" },
            { label: "Three-Day Weekend", desc: "$450 total", key: "3-day" },
          ].map((pkg) => (
            <div
              key={pkg.key}
              className="bg-gradient-to-r from-[var(--color-dark)] via-[var(--color-footer)] to-[var(--color-dark)] shadow-md py-10 px-2 flex items-center justify-center transition duration-300 ease-in-out hover:scale-105 cursor-pointer"
            >
              <div>
                <h3 className="text-3xl! font-broadsheet text-[var(--color-accent-gold)] mb-2">
                  {pkg.label}
                </h3>
                <p className="text-sm text-[var(--color-accent-sage)]">
                  {pkg.desc}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Sign in prompt OR form */}
        {!user ? (
          <div className="text-center">
            <p className="mb-4 text-md text-neutral-300">
              To continue your booking, please sign up with Google.
            </p>
            <img
              onClick={login}
              src={gsignup}
              alt="Sign in with Google"
              className="mx-auto cursor-pointer hover:scale-105 transition duration-300"
            />
          </div>
        ) : (
          <BookingForm />
        )}
      </div>
    </>
  );
};

export default BookingPage;
