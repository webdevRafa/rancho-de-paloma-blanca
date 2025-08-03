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
        <h1 className="text-center text-4xl md:text-4xl font-broadsheet mb-5 text-[var(--color-text)] translate-y-[-70%] bg-[var(--color-dark)] max-w-[300px] mx-auto">
          Book your next hunt
        </h1>

        {/* Pricing overview: display static pricing information so visitors know
        the rates for weekend packages and standard weekday/off-season
        pricing. These cards are informational only and do not affect the
        booking form. */}
        <section className="max-w-6xl mx-auto mb-16 grid md:grid-cols-4 gap-6 py-2 md:py-10">
          {[
            {
              label: "Weekend Single Day",
              desc: "Fri/Sat/Sun: $200 per person",
              key: "weekend-single",
            },
            {
              label: "Weekend 2-Day Combo",
              desc: "Fri+Sat or Sat+Sun: $350 per person",
              key: "weekend-two",
            },
            {
              label: "Weekend 3-Day Combo",
              desc: "Fri–Sun: $450 per person",
              key: "weekend-three",
            },
            {
              label: "All Other Days",
              desc: "$125 per person per day",
              key: "weekday",
            },
          ].map((pkg) => (
            <div
              key={pkg.key}
              className="bg-gradient-to-r md:bg-gradient-to-b from-[var(--color-dark)] via-[var(--color-footer)] to-[var(--color-dark)] shadow-md py-10 md:py-20 flex items-center justify-center"
            >
              <div className="text-center">
                <h3 className="text-2xl md:text-3xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
                  {pkg.label}
                </h3>
                <p className="text-xs md:text-sm text-[var(--color-accent-sage)]">
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
