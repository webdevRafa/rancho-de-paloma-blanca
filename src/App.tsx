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
import DevSeed from "./pages/DevSeed";
import MerchandisePage from "./pages/MerchandisePage";
import CheckoutPage from "./pages/CheckoutPage";
import ClientDashboard from "./pages/ClientDashboard";
import { useCart } from "./context/CartContext";
import GalleryPage from "./pages/GalleryPage";
import ContactPage from "./pages/ContactPage";
import AboutPage from "./pages/AboutPage";
import VideoGallery from "./pages/VideoGallery";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function App() {
  const { isHydrated } = useCart();

  useEffect(() => {
    AOS.init({
      duration: 1000, // animation duration in ms
      once: true, // only animate once when scrolling down
      offset: 50, // trigger point from the top (in px)
      easing: "ease-in-out",
    });
  }, []);
  if (!isHydrated) {
    return <div className="text-white text-center py-20">Loading...</div>;
  }

  return (
    <>
      <div className="min-h-screen mx-auto ">
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sponsor" element={<SponsorPage />} />
          <Route path="/rules" element={<PropertyRules />} />
          <Route path="/merch" element={<MerchandisePage />} />
          <Route path="/book" element={<BookingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/videos" element={<VideoGallery />} />

          <Route path="/contact" element={<ContactPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/dashboard" element={<ClientDashboard />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/dev-add-docs" element={<DevSeed />} />
        </Routes>
        <Footer />
      </div>
      <ToastContainer position="top-center" />
    </>
  );
}

export default App;
