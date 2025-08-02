import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import PropertyRules from "./pages/PropertyRules";

import HomePage from "./pages/HomePage";
import SponsorPage from "./pages/SponsorPage";
import { useEffect } from "react";
import AOS from "aos";
import "aos/dist/aos.css"; // Import AOS styles
import BookingPage from "./pages/BookingPage";

function App() {
  useEffect(() => {
    AOS.init({
      duration: 1000, // animation duration in ms
      once: true, // only animate once when scrolling down
      offset: 50, // trigger point from the top (in px)
      easing: "ease-in-out",
    });
  }, []);
  return (
    <>
      <div className="min-h-screen ">
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sponsor" element={<SponsorPage />} />
          <Route path="/rules" element={<PropertyRules />} />
          <Route path="/book" element={<BookingPage />} />
        </Routes>
        <Footer />
      </div>
    </>
  );
}

export default App;
