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

        <h1
          data-aos="fade-up"
          className="text-center text-4xl md:text-6xl font-broadsheet mb-5 text-[var(--color-text)] translate-y-[-70%] bg-[var(--color-dark)] max-w-[500px] mx-auto"
        >
          Book your next hunt
        </h1>

        {/* Pricing Overview */}
        <section className="max-w-4xl mx-auto flex flex-col  gap-3 mt-20">
          <div
            data-aos="fade-up"
            data-aos-delay="100"
            className="bg-[var(--color-card)] w-[90%] mx-auto py-10 flex items-start justify-center border-4 border-[var(--color-footer)]"
          >
            <div>
              <h1 className="text-center py-2 mb-2 text-3xl md:text-4xl">
                Special White Wing Weekends
              </h1>
              <div className="text-center text-[var(--color-accent-gold)]">
                <p className="bg-[var(--color-footer)] max-w-[300px] mx-auto mb-1 py-2">
                  $200 a day per gun
                </p>
                <p className="bg-[var(--color-footer)] max-w-[300px] mx-auto mb-1 py-2">
                  $350 for both days
                </p>
                <p className="bg-[var(--color-footer)] max-w-[300px] mx-auto mb-1 py-2">
                  $450 for three days
                </p>
              </div>
            </div>
          </div>

          <div
            data-aos="fade-up"
            data-aos-delay="200"
            className="bg-[var(--color-card)] w-full py-2 flex items-start justify-center border-4 border-[var(--color-footer)]"
          >
            <div>
              <h1 className="text-center py-2 mb-2 text-3xl md:text-4xl">
                Regular Season
              </h1>
              <div className="text-center text-[var(--color-accent-gold)]">
                <p className="bg-[var(--color-footer)] max-w-[300px] mx-auto mb-1 py-2">
                  $125 a day per gun
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Party Deck */}
        <section
          data-aos="fade-up"
          data-aos-delay="300"
          className="max-w-4xl mx-auto w-full mt-20"
        >
          <h1 className="text-center text-4xl md:text-6xl mb-0!">
            Party Deck Rental $500 a day
          </h1>
        </section>

        {/* Sign in or Form */}
        {!user ? (
          <div
            data-aos="fade-up"
            data-aos-delay="400"
            className="text-center mt-12"
          >
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
          <div data-aos="fade-up" data-aos-delay="400">
            <BookingForm />
          </div>
        )}
      </div>
    </>
  );
};

export default BookingPage;
