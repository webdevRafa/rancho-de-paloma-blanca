import { Link } from "react-router-dom";
import btb from "../assets/images/IMG_20250920_094948.jpg";
import { TiArrowBack } from "react-icons/ti";
import { RxCrosshair2 } from "react-icons/rx";
import group from "../assets/images/group.webp";

const BackTheBluePage = () => {
  return (
    <>
      <div className="absolute h-[100vh] w-full overflow-hidden z-[-1]">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_30%,rgba(0,0,0,0.02)_45%,var(--color-footer)_100%)]"></div>

        <img
          className="object-cover w-full h-full opacity-20"
          src={group}
          alt=""
        />
      </div>
      <div className="flex gap-2">
        <Link
          to="/"
          className="flex items-center justify-center text-sm mb-5 mx-auto  mt-40 max-w-[300px] font-gin p-2 border-red-300 border-2 bg-red-400 hover:bg-red-500 transition duration-300 ease-in-out"
        >
          <p>Back to Home</p>
          <TiArrowBack />
        </Link>
      </div>

      <div data-aos="zoom-in-up" className="w-full h-full">
        <img className="mx-auto max-h-[600px]" src={btb} alt="" />
        <a
          className="mx-auto text-center mt-4 text-sm font-gin justify-center items-center gap-1 border-blue-300 border-2 bg-blue-400 hover:bg-blue-500 transition duration-300 ease-in-out max-w-[150px] p-2 flex"
          target="_blank"
          href="https://of.deluxe.com/gateway/publish/3075328e-ad6b-a92f-3bf7-eeb1ebfe1884"
        >
          SECURE YOUR SPOT
          <RxCrosshair2 />
        </a>
      </div>
    </>
  );
};

export default BackTheBluePage;
