import { Link } from "react-router-dom";
import btb from "../assets/images/IMG_20250920_094948.jpg";
import { TiArrowBack } from "react-icons/ti";

const BackTheBluePage = () => {
  return (
    <>
      <Link
        to="/"
        data-aos="fade-in"
        data-aos-delay="2000"
        className="flex items-center justify-center mb-5 mx-auto text-white mt-30 max-w-[300px] font-gin text-lg"
      >
        <p>Back to Home</p>
        <TiArrowBack />
      </Link>

      <div data-aos="zoom-in-up" className="w-full h-fulll">
        <img className="mx-auto max-h-[800px]" src={btb} alt="" />
      </div>
    </>
  );
};

export default BackTheBluePage;
