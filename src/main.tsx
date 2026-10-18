
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Outlet, useLocation } from "react-router";
import { useEffect, lazy, Suspense } from "react";
import Home from "./home/Home";
import Site from "./site/Site";
import "./styles/index.css";

const Club = lazy(() => import("./club/Club"));
const ClubCava = lazy(() => import("./club/ClubCava"));
const ClubReferidos = lazy(() => import("./club/ClubReferidos"));
const ClubNegocios = lazy(() => import("./club/negocios/ClubNegocios"));

function RootLayout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/",                element: <Home /> },
      { path: "/paquetes",        element: <Site /> },
      { path: "/club",            element: <Suspense fallback={null}><Club /></Suspense> },
      { path: "/club/cava",       element: <Suspense fallback={null}><ClubCava /></Suspense> },
      { path: "/club/referidos",  element: <Suspense fallback={null}><ClubReferidos /></Suspense> },
      { path: "/club/negocios",   element: <Suspense fallback={null}><ClubNegocios /></Suspense> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />
);
